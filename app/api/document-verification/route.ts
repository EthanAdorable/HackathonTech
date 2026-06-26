import { inflateRawSync, inflateSync } from "node:zlib";
import { ConvexHttpClient } from "convex/browser";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { withTimeout } from "@/lib/async-timeout";
import {
  compileVerificationSummary,
  makeVerificationCacheKey,
  runDeterministicVerification,
  validateExtractionJson,
  type DocumentExtraction,
  type VerificationResult,
  type VerificationRunStatus,
} from "@/lib/document-verification";
import {
  activeExtractionSchemaVersion,
  activePromptVersion,
  activeRubricVersionId,
  getRubricProfile,
  isSupportedDocumentMimeType,
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

const defaultCodexLbBaseUrl = "https://codex-lb-production-6b47.up.railway.app/v1";
const defaultCodexLbModel = "gpt-5.4-mini";

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
    if (!activeDocuments.length) {
      return NextResponse.json({ source: "convex", error: "No active uploaded documents were found." }, { status: 409 });
    }

    const urlsByAttachment = new Map<string, string>();
    for (const attachment of application.attachments ?? []) {
      if (attachment.status === "active" && attachment.url) urlsByAttachment.set(attachment.id, attachment.url);
    }

    const outcomes = [];
    const codexLbApiKey = process.env.CODEX_LB_API_KEY;
    const fileSignature = activeDocumentSignature(activeDocuments);
    for (const document of activeDocuments) {
      const profile = getRubricProfile(document.documentType);
      const cacheKey = makeVerificationCacheKey({
        sha256: document.sha256,
        rubricVersionId: document.rubricVersionId,
        extractionSchemaVersion: document.extractionSchemaVersion,
        promptVersion: document.promptVersion,
      });
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

      if (!profile) {
        extractionError = `No rubric profile is registered for ${document.documentType}.`;
        status = "failed_rubric_unavailable";
      } else if (!isSupportedDocumentMimeType(document.mimeType)) {
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
          if (!source.text.trim()) {
            extractionError = "No readable text or table content could be extracted from the source file.";
            status = "failed_schema";
          } else {
            model = process.env.CODEX_LB_MODEL ?? defaultCodexLbModel;
            aiSource = "codex-lb";
            const aiJson = await extractWithCodexLb({
              apiKey: codexLbApiKey,
              model,
              documentType: document.documentType,
              fileName: document.originalName,
              extractedText: source.text,
              sourceLocations: source.locations,
              requiredFieldIds: profile.requiredFieldIds,
            });
            const validation = validateExtractionJson(aiJson);
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

      outcomes.push({
        runId,
        status,
        extraction,
        extractedTextPreview,
        extractionError,
        model,
        aiSource,
        results,
      });
    }

    const allResults = outcomes.flatMap((outcome) => outcome.results);
    const summary = compileVerificationSummary({
      rubricVersionId: activeRubricVersionId,
      documentCount: activeDocuments.length,
      fileSignature,
      results: allResults,
      runStatuses: outcomes.map((outcome) => outcome.status),
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
          summary,
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

function activeDocumentSignature(documents: ActiveDocument[]) {
  const parts = documents
    .map((document) => [
      document.documentType,
      document.sha256,
      document.rubricVersionId,
      document.extractionSchemaVersion,
      document.promptVersion,
    ].join(":"))
    .sort();
  return parts.length ? parts.join("|") : "no-files";
}

async function fetchDocumentSource(url: string, mimeType: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to fetch uploaded document: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (mimeType === "text/csv") {
    return { text: buffer.toString("utf8"), locations: ["csv:rows"] };
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extractDocxText(buffer);
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return extractXlsxText(buffer);
  }
  if (mimeType === "application/pdf") {
    return extractPdfText(buffer);
  }
  return { text: "", locations: [] };
}

function extractDocxText(buffer: Buffer) {
  const entries = readZipEntries(buffer);
  const documentXml = entries.get("word/document.xml") ?? "";
  const text = xmlText(documentXml).replace(/\s+/g, " ").trim();
  return { text, locations: text ? ["docx:word/document.xml"] : [] };
}

function extractXlsxText(buffer: Buffer) {
  const entries = readZipEntries(buffer);
  const sharedStrings = xmlText(entries.get("xl/sharedStrings.xml") ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const sheetTexts = [...entries.entries()]
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .map(([name, xml]) => `${name}: ${xmlText(xml)} ${sharedStrings.join(" ")}`);
  return { text: sheetTexts.join("\n").trim(), locations: sheetTexts.map((text) => text.split(":")[0]) };
}

function extractPdfText(buffer: Buffer) {
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
  return { text, locations: text ? ["pdf:text-spans"] : [] };
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
  extractedText: string;
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
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract factual document data only. Return strict JSON with no recommendations. Do not infer facts that are not evidenced in the supplied text.",
        },
        {
          role: "user",
          content: JSON.stringify({
            requiredSchema: {
              documentType: input.documentType,
              schemaVersion: activeExtractionSchemaVersion,
              normalizedFields: [
                {
                  fieldId: "string",
                  label: "string",
                  value: "string | number | boolean | null",
                  confidence: "number 0..1",
                  evidence: ["short factual quote"],
                  sourceLocations: ["page, paragraph, sheet, cell, or text span"],
                },
              ],
              missingFields: ["fieldId"],
              unknownFields: ["fieldId"],
              confidence: "number 0..1",
              evidence: ["short factual quote"],
              sourceLocations: ["page, paragraph, sheet, cell, or text span"],
            },
            fileName: input.fileName,
            documentType: input.documentType,
            schemaVersion: activeExtractionSchemaVersion,
            promptVersion: activePromptVersion,
            requiredFieldIds: input.requiredFieldIds,
            sourceLocations: input.sourceLocations,
            extractedText: input.extractedText.slice(0, 14000),
          }),
        },
      ],
    }),
    Number(process.env.CODEX_LB_TIMEOUT_MS ?? 12000),
  );
  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("Codex-LB returned an empty extraction response.");
  return JSON.parse(content);
}
