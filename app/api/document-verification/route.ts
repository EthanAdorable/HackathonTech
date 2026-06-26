import { inflateRawSync, inflateSync } from "node:zlib";
import { ConvexHttpClient } from "convex/browser";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { withTimeout } from "@/lib/async-timeout";
import { codexLbReasoningEffort, defaultCodexLbBaseUrl, defaultCodexLbModel } from "@/lib/codex-lb";
import {
  compileVerificationSummary,
  makeVerificationCacheKey,
  runCrossDocumentVerification,
  runDeterministicVerification,
  validateExtractionJson,
  documentExtractionSchemas,
  type DocumentExtraction,
  type DocumentVerificationSummary,
  type ExtractionMode,
  type VerificationResult,
  type VerificationRunStatus,
} from "@/lib/document-verification";
import {
  activeExtractionSchemaVersion,
  activePromptVersion,
  activeRubricVersionId,
  getRubricProfile,
  isSupportedDocumentMimeType,
  isVerificationDocumentType,
} from "@/lib/rubrics";
import { getAccessActor } from "@/lib/server-access";

export const runtime = "nodejs";

type VerificationRequest = {
  applicationId: string;
};

type ActiveDocument = {
  id: Id<"uploadedDocuments">;
  attachmentId: string;
  sha256: string;
  mimeType: string;
  originalName: string;
  documentType: string;
  rubricVersionId: string;
  extractionSchemaVersion: string;
  promptVersion: string;
};

type HydratedAttachment = {
  id?: string;
  attachmentId?: string;
  status?: string;
  url?: string | null;
};

type HydratedRequirement = {
  activeAttachment?: HydratedAttachment | null;
};

type HydratedTemplate = {
  attachments?: HydratedAttachment[];
  requirements?: HydratedRequirement[];
};

type HydratedApplication = {
  attachments?: HydratedAttachment[];
  templates?: HydratedTemplate[];
  requirements?: HydratedRequirement[];
};

type DocumentSource = {
  text: string;
  locations: string[];
  mode: ExtractionMode;
  mediaDataUrl?: string;
  sourceFileBase64?: string;
};

type CodexLbContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export async function POST(request: Request) {
  const actor = await getAccessActor();
  if (!actor) {
    return NextResponse.json({ source: "access-denied", error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json()) as VerificationRequest;
  if (!body.applicationId || body.applicationId.startsWith("app-")) {
    return NextResponse.json({ source: "local", error: "Convex-backed application id is required." }, { status: 400 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ source: "local", error: "NEXT_PUBLIC_CONVEX_URL is required for document verification." }, { status: 503 });
  }

  const client = new ConvexHttpClient(convexUrl);
  const applicationId = body.applicationId as Id<"applications">;
  try {
    const application = await withTimeout(client.query(api.applications.get, { actor, applicationId }));
    if (!application) {
      return NextResponse.json({ source: "convex", error: "Application not found." }, { status: 404 });
    }

    const activeDocuments = (await withTimeout(
      client.query(api.verification.listActiveDocuments, { actor, applicationId }),
    )) as ActiveDocument[];
    const verificationDocuments = activeDocuments.filter((document) => isVerificationDocumentType(document.documentType));
    if (!verificationDocuments.length) {
      return NextResponse.json({ source: "convex", error: "No active APP, APF, or VERF uploaded documents were found." }, { status: 409 });
    }

    const urlsByAttachment = collectAttachmentUrls(application);

    const codexLbApiKey = process.env.CODEX_LB_API_KEY;
    const fileSignature = activeDocumentSignature(verificationDocuments);
    const missingDocumentResults = missingRequiredDocumentResults(verificationDocuments);
    const outcomes = await Promise.all(verificationDocuments.map(async (document) => {
      const profile = getRubricProfile(document.documentType);
      const cacheKey = makeVerificationCacheKey({
        sha256: document.sha256,
        rubricVersionId: activeRubricVersionId,
        extractionSchemaVersion: activeExtractionSchemaVersion,
        promptVersion: activePromptVersion,
      });
      const cached = await withTimeout(
        client.query(api.verification.getCachedExtraction, {
          actor,
          uploadedDocumentId: document.id,
          cacheKey,
        }),
      );
      const { runId } = await withTimeout(
        client.mutation(api.verification.beginExtractionRun, {
          actor,
          uploadedDocumentId: document.id,
          cacheKey,
        }),
      );

      const url = urlsByAttachment.get(document.attachmentId);
      let extraction: DocumentExtraction | undefined;
      let extractionError: string | undefined;
      let extractedTextPreview = "";
      let status: VerificationRunStatus = "verifying";
      let model: string | undefined;
      let aiSource: string | undefined;

      if (cached?.run && cached.results.length) {
        extraction = cached.run.extractionJson as DocumentExtraction | undefined;
        extractedTextPreview = cached.run.extractedTextPreview ?? "";
        extractionError = cached.run.failureReason;
        status = cached.run.status as VerificationRunStatus;
        model = cached.run.model;
        aiSource = cached.run.aiSource ? `${cached.run.aiSource}:cache` : "cache";
        return {
          documentType: document.documentType,
          runId,
          status,
          extraction,
          extractedTextPreview,
          extractionError,
          model,
          aiSource,
          results: normalizeCachedResults(cached.results),
        };
      }

      if (!profile) {
        extractionError = `No rubric profile is registered for ${document.documentType}.`;
        status = "failed_rubric_unavailable";
      } else if (!isSupportedDocumentMimeType(document.mimeType, document.documentType)) {
        extractionError = `${document.mimeType} is not a supported document verification MIME type.`;
        status = "failed_schema";
      } else if (!url) {
        extractionError = "Convex storage URL was unavailable for the active attachment.";
        status = "failed_schema";
      } else if (!codexLbApiKey) {
        extractionError = "CODEX_LB_API_KEY is required; verification fails closed without an AI extraction call.";
        status = "failed_ai_timeout";
      } else {
        try {
          const source = await fetchDocumentSource(url, document.mimeType);
          extractedTextPreview = source.text.slice(0, 1800);
          if (!source.text.trim() && !source.mediaDataUrl && !source.sourceFileBase64) {
            extractionError = "No readable text, image, or source content could be extracted from the source file.";
            status = "failed_schema";
          } else {
            model = process.env.CODEX_LB_MODEL ?? defaultCodexLbModel;
            aiSource = source.mode === "vision_ocr" || source.mode === "weak_pdf_vision" ? "codex-lb:vision-ocr" : "codex-lb";
            const aiJson = await extractWithCodexLb({
              apiKey: codexLbApiKey,
              model,
              documentType: document.documentType,
              fileName: document.originalName,
              source,
              sourceLocations: source.locations,
              requiredFieldIds: profile.requiredFieldIds,
            });
            const validation = validateExtractionJson(aiJson, {
              documentType: document.documentType,
              extractionMode: source.mode,
            });
            if (validation.ok) {
              extraction = validation.extraction;
            } else {
              extractionError = validation.error;
              status = "failed_schema";
            }
          }
        } catch (error) {
          extractionError = error instanceof Error ? error.message : "Codex-LB extraction failed.";
          status = "failed_schema";
          if (/timed out|timeout|rate|429|503/i.test(extractionError)) status = "failed_ai_timeout";
        }
      }

      const results: VerificationResult[] = profile
        ? runDeterministicVerification({
            profile,
            mimeType: document.mimeType,
            extraction,
            extractionError,
            rubricVersionId: activeRubricVersionId,
            extractionSchemaVersion: activeExtractionSchemaVersion,
            promptVersion: activePromptVersion,
          })
        : [
            {
              checkId: "rubric_available",
              label: "Rubric profile is available",
              status: "fail",
              severity: "critical",
              blocking: true,
              evidence: [extractionError ?? "No rubric profile."],
              recommendation: "Register a code-seeded rubric profile before accepting this document type.",
              method: "deterministic",
              confidence: 1,
              failureReason: extractionError,
            },
          ];

      if (status === "verifying") {
        status = results.some((result) => result.severity === "critical" && result.status === "fail")
          ? "blocked_critical"
          : results.some((result) => result.status === "warning" || result.status === "manual_review")
            ? "needs_human_review"
            : "ready_for_sadu";
      }

      return {
        documentType: document.documentType,
        runId,
        status,
        extraction,
        extractedTextPreview,
        extractionError,
        model,
        aiSource,
        results,
      };
    }));

    const crossDocumentResults = runCrossDocumentVerification(
      outcomes.flatMap((outcome) => (outcome.extraction ? [outcome.extraction] : [])),
    );
    const allResults = [...outcomes.flatMap((outcome) => outcome.results), ...missingDocumentResults, ...crossDocumentResults];
    const documentSummaries: DocumentVerificationSummary[] = outcomes.map((outcome) => {
      const blockers = outcome.results.filter((result) => result.severity === "critical" && result.status === "fail");
      const warnings = outcome.results.filter((result) => result.severity === "warning" && ["warning", "manual_review"].includes(result.status));
      return {
        documentType: outcome.extraction?.documentType ?? outcome.documentType,
        status: outcome.status,
        fieldCount: outcome.extraction?.normalizedFields.length ?? 0,
        confidence: outcome.extraction?.confidence ?? 0,
        extractionMode: outcome.extraction?.extractionMode,
        blockerCount: blockers.length,
        warningCount: warnings.length,
      };
    });
    const summary = compileVerificationSummary({
      rubricVersionId: activeRubricVersionId,
      documentCount: verificationDocuments.length,
      fileSignature,
      results: allResults,
      runStatuses: outcomes.map((outcome) => outcome.status),
      documentSummaries,
    });

    for (const outcome of outcomes) {
      await withTimeout(
        client.mutation(api.verification.saveVerificationOutcome, {
          actor,
          extractionRunId: outcome.runId,
          status: outcome.status,
          extractionJson: outcome.extraction,
          extractedTextPreview: outcome.extractedTextPreview,
          failureReason: outcome.extractionError,
          model: outcome.model,
          aiSource: outcome.aiSource,
          results: outcome.results,
          summary: { ...summary, extractionRunIds: outcomes.map((item) => item.runId) },
        }),
      );
    }

    const statusCode = summary.readyForSadu ? 200 : outcomes.some((outcome) => outcome.status === "failed_ai_timeout") ? 503 : 409;
    return NextResponse.json({ source: "convex", summary }, { status: statusCode });
  } catch (error) {
    return NextResponse.json(
      {
        source: "convex",
        error: error instanceof Error ? error.message : "Document verification failed.",
      },
      { status: 500 },
    );
  }
}

function collectAttachmentUrls(application: HydratedApplication) {
  const urlsByAttachment = new Map<string, string>();
  const addAttachment = (attachment: HydratedAttachment | null | undefined) => {
    if (!attachment?.url) return;
    if (attachment.status && !["active", "uploaded"].includes(attachment.status)) return;
    const id = attachment.attachmentId ?? attachment.id;
    if (id) urlsByAttachment.set(String(id), attachment.url);
  };

  for (const attachment of application.attachments ?? []) addAttachment(attachment);
  for (const template of application.templates ?? []) {
    for (const attachment of template.attachments ?? []) addAttachment(attachment);
    for (const requirement of template.requirements ?? []) addAttachment(requirement.activeAttachment);
  }
  for (const requirement of application.requirements ?? []) addAttachment(requirement.activeAttachment);

  return urlsByAttachment;
}

function activeDocumentSignature(documents: ActiveDocument[]) {
  const parts = documents
    .map((document) => [
      document.documentType,
      document.sha256,
      activeRubricVersionId,
      activeExtractionSchemaVersion,
      activePromptVersion,
    ].join(":"))
    .sort();
  return parts.length ? parts.join("|") : "no-files";
}

function normalizeCachedResults(results: Array<Record<string, unknown>>): VerificationResult[] {
  return results.map((result) => ({
    checkId: String(result.checkId),
    label: String(result.label),
    status: result.status as VerificationResult["status"],
    severity: result.severity as VerificationResult["severity"],
    blocking: Boolean(result.blocking),
    evidence: Array.isArray(result.evidence) ? result.evidence.map(String) : [],
    recommendation: String(result.recommendation),
    method: result.method as VerificationResult["method"],
    confidence: typeof result.confidence === "number" ? result.confidence : 0,
    failureReason: typeof result.failureReason === "string" ? result.failureReason : undefined,
    documentType: typeof result.documentType === "string" ? result.documentType : undefined,
  }));
}

function missingRequiredDocumentResults(documents: ActiveDocument[]): VerificationResult[] {
  const uploadedTypes = new Set(documents.map((document) => document.documentType));
  return (["app", "apf", "verf"] as const)
    .filter((documentType) => !uploadedTypes.has(documentType))
    .map((documentType) => ({
      checkId: "required_document_slot_present",
      label: `${documentType.toUpperCase()} required document slot is present`,
      status: "fail" as const,
      severity: "critical" as const,
      blocking: true,
      evidence: [`No active ${documentType.toUpperCase()} uploaded document was found.`],
      recommendation: `Upload the completed ${documentType.toUpperCase()} form and run document verification again.`,
      method: "deterministic" as const,
      confidence: 1,
      failureReason: "Required APP/APF/VERF upload is missing.",
      documentType,
    }));
}

async function fetchDocumentSource(url: string, mimeType: string): Promise<DocumentSource> {
  if (mimeType === "image/jpeg" || mimeType === "image/png") {
    return {
      text: "",
      locations: [`image:${mimeType}`],
      mode: "vision_ocr" as ExtractionMode,
      mediaDataUrl: url,
    };
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to fetch uploaded document: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (mimeType === "text/csv") {
    return { text: buffer.toString("utf8"), locations: ["csv:rows"], mode: "text_csv" as ExtractionMode };
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extractDocxText(buffer);
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return extractXlsxText(buffer);
  }
  if (mimeType === "application/pdf") {
    const pdf = await extractPdfText(buffer);
    if (pdf.text.length < 300) {
      return {
        ...pdf,
        mode: "weak_pdf_vision" as ExtractionMode,
        sourceFileBase64: buffer.toString("base64").slice(0, 900000),
      };
    }
    return pdf;
  }
  return { text: "", locations: [], mode: "text_pdf" as ExtractionMode };
}

function extractDocxText(buffer: Buffer) {
  const entries = readZipEntries(buffer);
  const documentXml = entries.get("word/document.xml") ?? "";
  const text = xmlText(documentXml).replace(/\s+/g, " ").trim();
  return { text, locations: text ? ["docx:word/document.xml"] : [], mode: "text_docx" as ExtractionMode };
}

function extractXlsxText(buffer: Buffer) {
  const entries = readZipEntries(buffer);
  const sharedStrings = xmlText(entries.get("xl/sharedStrings.xml") ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const sheetTexts = [...entries.entries()]
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .map(([name, xml]) => `${name}: ${xmlText(xml)} ${sharedStrings.join(" ")}`);
  return { text: sheetTexts.join("\n").trim(), locations: sheetTexts.map((text) => text.split(":")[0]), mode: "text_xlsx" as ExtractionMode };
}

async function extractPdfText(buffer: Buffer) {
  const fallback = extractPdfTextFallback(buffer);
  let parser: PDFParse | undefined;
  try {
    parser = new PDFParse({ data: new Uint8Array(buffer) });
    const parsed = await parser.getText({ pageJoiner: "\n-- page_number of total_number --\n" });
    const text = normalizeExtractedPdfText(parsed.text);
    if (text.length >= 300) {
      return {
        text,
        locations: parsed.pages.map((page) => `pdf:page-${page.num}`),
        mode: "text_pdf" as ExtractionMode,
      };
    }
  } catch (error) {
    console.warn("PDFParse failed; falling back to lightweight PDF text extraction.", error);
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
  return fallback;
}

function extractPdfTextFallback(buffer: Buffer) {
  const chunks: string[] = [];
  const raw = buffer.toString("latin1");
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const stream = Buffer.from(match[1], "latin1");
    try {
      chunks.push(inflateSync(stream).toString("latin1"));
    } catch {
      chunks.push(stream.toString("latin1"));
    }
  }
  chunks.push(raw);
  const text = chunks
    .join("\n")
    .replace(/\\\(|\\\)/g, "")
    .match(/\(([^()]{2,})\)/g)
    ?.map((item) => item.slice(1, -1))
    .join(" ")
    .replace(/[^\x20-\x7E\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() ?? "";
  return { text, locations: text ? ["pdf:text-spans"] : [], mode: "text_pdf" as ExtractionMode };
}

function normalizeExtractedPdfText(text: string) {
  return text
    .replace(/[^\x20-\x7E\n]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function readZipEntries(buffer: Buffer) {
  const entries = new Map<string, string>();
  let offset = 0;
  while (offset < buffer.length - 30) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString("utf8");
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    if (name && !name.endsWith("/")) {
      const content = method === 8 ? inflateRawSync(data).toString("utf8") : data.toString("utf8");
      entries.set(name, content);
    }
    offset = dataStart + compressedSize;
  }
  return entries;
}

function xmlText(xml: string) {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractWithCodexLb(input: {
  apiKey: string;
  model: string;
  documentType: string;
  fileName: string;
  source: DocumentSource;
  sourceLocations: string[];
  requiredFieldIds: string[];
}) {
  const client = new OpenAI({
    apiKey: input.apiKey,
    baseURL: (process.env.CODEX_LB_BASE_URL || defaultCodexLbBaseUrl).replace(/\/+$/, ""),
  });
  const completion = await withTimeout(
    client.chat.completions.create({
      model: input.model,
      reasoning_effort: codexLbReasoningEffort(process.env.CODEX_LB_EXTRACTION_REASONING_EFFORT ?? "low"),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract factual document data only. Return strict compact json with no recommendations. Do not infer facts that are not evidenced in the supplied text.",
        },
        {
          role: "user",
          content: codexLbUserContent(input),
        },
      ],
    }),
    Number(process.env.CODEX_LB_TIMEOUT_MS ?? 45000),
  );
  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("Codex-LB returned an empty extraction response.");
  return JSON.parse(content);
}

function codexLbUserContent(input: {
  documentType: string;
  fileName: string;
  source: DocumentSource;
  sourceLocations: string[];
  requiredFieldIds: string[];
}) {
  const schema = documentExtractionSchemas[input.documentType as keyof typeof documentExtractionSchemas];
  const payload = {
    instruction:
      "Return only compact json. Extract factual APP/APF/VERF data. Mark blank templates as completenessStatus=blank_or_incomplete. Include documentData and normalizedFields. normalizedFields must use fieldId, label, value, confidence, evidence, sourceLocations. Use null for unknown values and do not explain.",
    requiredSchema: {
      documentType: input.documentType,
      schemaVersion: activeExtractionSchemaVersion,
      completenessStatus: "filled | blank_or_incomplete",
      extractionMode: input.source.mode,
      formCode: "string | null",
      formVersion: "string | null",
      pageCount: "number | undefined",
      hasPage2: "boolean | undefined",
      documentData: Object.fromEntries([...(schema?.fields ?? []), ...(schema?.optionalFields ?? [])].map((field) => [field, "string | number | boolean | array | null"])),
      normalizedFields: [
        {
          fieldId: "string",
          label: "string",
          value: "string | number | boolean | string[] | object[] | null",
          confidence: "number 0..1",
          evidence: ["short factual quote or visual observation"],
          sourceLocations: ["page, paragraph, sheet, cell, text span, or image region"],
        },
      ],
      missingFields: ["fieldId"],
      unknownFields: ["fieldId"],
      confidence: "number 0..1",
      evidence: ["short factual quote or visual observation"],
      sourceLocations: ["page, paragraph, sheet, cell, text span, or image region"],
    },
    fileName: input.fileName,
    documentType: input.documentType,
    schemaVersion: activeExtractionSchemaVersion,
    promptVersion: activePromptVersion,
    requiredFieldIds: input.requiredFieldIds,
    documentExtractionSchema: schema,
    sourceMode: input.source.mode,
    sourceLocations: input.sourceLocations,
    extractedText: compactSourceText(input.source.text),
    sourceFileBase64:
      input.source.sourceFileBase64 && !input.source.mediaDataUrl
        ? {
            mimeType: "application/pdf",
            note: "Weak-text PDF supplied as base64 for OCR-style extraction through Codex-LB where supported.",
            base64: input.source.sourceFileBase64,
          }
        : undefined,
  };

  if (!input.source.mediaDataUrl) return JSON.stringify(payload);
  return [
    {
      type: "text",
      text: JSON.stringify(payload),
    },
    {
      type: "image_url",
      image_url: {
        url: input.source.mediaDataUrl,
      },
    },
  ] satisfies CodexLbContentPart[];
}

function compactSourceText(text: string) {
  const normalized = text
    .replace(/\b[A-Za-z0-9+/=]{80,}\b/g, " ")
    .replace(/[^\x20-\x7E\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= 3600) return normalized;
  return `${normalized.slice(0, 1900)} ... [middle omitted] ... ${normalized.slice(-1500)}`;
}
