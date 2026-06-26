import { createHash } from "node:crypto";
import {
  activeExtractionSchemaVersion,
  activePromptVersion,
  type DocumentRubricProfile,
  isSupportedDocumentMimeType,
} from "./rubrics";
import type { EventApplication, RequirementAttachment } from "./tams-data";

export type VerificationRunStatus =
  | "queued"
  | "extracting"
  | "extracted"
  | "verifying"
  | "ready_for_sadu"
  | "blocked_critical"
  | "needs_human_review"
  | "failed_schema"
  | "failed_ai_timeout"
  | "failed_rubric_unavailable";

export type VerificationCheckStatus = "pass" | "fail" | "warning" | "manual_review" | "skipped";
export type VerificationSeverity = "critical" | "warning" | "info";
export type VerificationMethod = "deterministic" | "ai_assisted";

export type ExtractedField = {
  fieldId: string;
  label: string;
  value: string | number | boolean | null;
  confidence: number;
  evidence: string[];
  sourceLocations: string[];
};

export type DocumentExtraction = {
  documentType: string;
  schemaVersion: string;
  normalizedFields: ExtractedField[];
  missingFields: string[];
  unknownFields: string[];
  confidence: number;
  evidence: string[];
  sourceLocations: string[];
};

export type VerificationResult = {
  checkId: string;
  label: string;
  status: VerificationCheckStatus;
  severity: VerificationSeverity;
  blocking: boolean;
  evidence: string[];
  recommendation: string;
  method: VerificationMethod;
  confidence: number;
  failureReason?: string;
};

export type CompiledVerificationSummary = {
  status: VerificationRunStatus;
  rubricVersionId: string;
  documentCount: number;
  criticalFailureCount: number;
  warningCount: number;
  readyForSadu: boolean;
  currentFileSignature: string;
  blockingFindings: Array<Pick<VerificationResult, "checkId" | "label" | "recommendation" | "failureReason">>;
  warnings: Array<Pick<VerificationResult, "checkId" | "label" | "recommendation" | "failureReason">>;
  generatedAt: string;
};

export function sha256Buffer(buffer: ArrayBuffer | Buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(new Uint8Array(buffer));
  return createHash("sha256").update(bytes).digest("hex");
}

export async function sha256File(file: File) {
  return sha256Buffer(await file.arrayBuffer());
}

export function makeVerificationCacheKey(input: {
  sha256: string;
  rubricVersionId: string;
  extractionSchemaVersion?: string;
  promptVersion?: string;
}) {
  return [
    input.sha256,
    input.rubricVersionId,
    input.extractionSchemaVersion ?? activeExtractionSchemaVersion,
    input.promptVersion ?? activePromptVersion,
  ].join(":");
}

export function validateExtractionJson(value: unknown): { ok: true; extraction: DocumentExtraction } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Extraction must be a JSON object." };
  const candidate = value as Partial<DocumentExtraction>;
  if (typeof candidate.documentType !== "string") return { ok: false, error: "documentType is required." };
  if (candidate.schemaVersion !== activeExtractionSchemaVersion) {
    return { ok: false, error: `schemaVersion must be ${activeExtractionSchemaVersion}.` };
  }
  if (!Array.isArray(candidate.normalizedFields)) return { ok: false, error: "normalizedFields must be an array." };
  if (!Array.isArray(candidate.missingFields)) return { ok: false, error: "missingFields must be an array." };
  if (!Array.isArray(candidate.unknownFields)) return { ok: false, error: "unknownFields must be an array." };
  if (typeof candidate.confidence !== "number" || candidate.confidence < 0 || candidate.confidence > 1) {
    return { ok: false, error: "confidence must be a number from 0 to 1." };
  }
  if (!Array.isArray(candidate.evidence)) return { ok: false, error: "evidence must be an array." };
  if (!Array.isArray(candidate.sourceLocations)) return { ok: false, error: "sourceLocations must be an array." };

  for (const field of candidate.normalizedFields) {
    if (!field || typeof field !== "object") return { ok: false, error: "Each normalized field must be an object." };
    const normalized = field as Partial<ExtractedField>;
    if (typeof normalized.fieldId !== "string") return { ok: false, error: "Each normalized field needs fieldId." };
    if (typeof normalized.label !== "string") return { ok: false, error: "Each normalized field needs label." };
    if (typeof normalized.confidence !== "number" || normalized.confidence < 0 || normalized.confidence > 1) {
      return { ok: false, error: "Each normalized field needs confidence from 0 to 1." };
    }
    if (!Array.isArray(normalized.evidence) || !Array.isArray(normalized.sourceLocations)) {
      return { ok: false, error: "Each normalized field needs evidence and sourceLocations arrays." };
    }
  }

  return { ok: true, extraction: candidate as DocumentExtraction };
}

export function runDeterministicVerification(input: {
  profile: DocumentRubricProfile;
  mimeType: string;
  extraction?: DocumentExtraction;
  extractionError?: string;
}): VerificationResult[] {
  const results: VerificationResult[] = [];
  const supported = isSupportedDocumentMimeType(input.mimeType);
  results.push({
    checkId: "source_file_supported",
    label: "Source file type is supported",
    status: supported ? "pass" : "fail",
    severity: "critical",
    blocking: !supported,
    evidence: [`MIME type: ${input.mimeType}`],
    recommendation: supported ? "No action needed." : "Upload a supported PDF, DOCX, XLSX, or CSV file.",
    method: "deterministic",
    confidence: 1,
    failureReason: supported ? undefined : "Unsupported MIME type.",
  });

  const schemaValid = Boolean(input.extraction && !input.extractionError);
  results.push({
    checkId: "schema_valid",
    label: "Extraction JSON matches schema",
    status: schemaValid ? "pass" : "fail",
    severity: "critical",
    blocking: !schemaValid,
    evidence: schemaValid ? [`Schema version: ${input.extraction?.schemaVersion}`] : [input.extractionError ?? "Extraction was not produced."],
    recommendation: schemaValid ? "No action needed." : "Retry verification after Codex-LB is available and returns valid JSON.",
    method: "deterministic",
    confidence: 1,
    failureReason: schemaValid ? undefined : input.extractionError ?? "Missing extraction.",
  });

  if (!input.extraction) return results;

  const extractedFieldIds = new Set(input.extraction.normalizedFields.map((field) => field.fieldId));
  const missingCritical = input.profile.requiredFieldIds.filter((fieldId) => !extractedFieldIds.has(fieldId));
  results.push({
    checkId: "required_fields_present",
    label: "Required rubric fields are present",
    status: missingCritical.length ? "fail" : "pass",
    severity: "critical",
    blocking: missingCritical.length > 0,
    evidence: missingCritical.length ? missingCritical.map((fieldId) => `Missing field: ${fieldId}`) : ["All required placeholder fields were extracted."],
    recommendation: missingCritical.length
      ? "Upload a complete source document or revise the document so required details are stated clearly."
      : "No action needed.",
    method: "ai_assisted",
    confidence: input.extraction.confidence,
    failureReason: missingCritical.length ? "Required fields were missing from the extraction output." : undefined,
  });

  const lowConfidence = input.extraction.normalizedFields.filter((field) => field.confidence < 0.72);
  if (lowConfidence.length) {
    results.push({
      checkId: "low_confidence_evidence",
      label: "Evidence confidence is reviewable",
      status: "warning",
      severity: "warning",
      blocking: false,
      evidence: lowConfidence.slice(0, 4).map((field) => `${field.label}: ${Math.round(field.confidence * 100)}% confidence`),
      recommendation: "SADU should review low-confidence evidence before final approval.",
      method: "ai_assisted",
      confidence: Math.min(...lowConfidence.map((field) => field.confidence)),
    });
  }

  return results;
}

export function compileVerificationSummary(input: {
  rubricVersionId: string;
  documentCount: number;
  fileSignature: string;
  results: VerificationResult[];
  runStatuses?: VerificationRunStatus[];
  generatedAt?: string;
}): CompiledVerificationSummary {
  const criticalFailures = input.results.filter((result) => result.severity === "critical" && result.status === "fail");
  const warnings = input.results.filter((result) => result.severity === "warning" && ["warning", "manual_review"].includes(result.status));
  const failedRunStatus = input.runStatuses?.find((status) => status.startsWith("failed_"));
  const status: VerificationRunStatus = failedRunStatus
    ? failedRunStatus
    : criticalFailures.length
      ? "blocked_critical"
      : warnings.length
        ? "needs_human_review"
        : "ready_for_sadu";

  return {
    status,
    rubricVersionId: input.rubricVersionId,
    documentCount: input.documentCount,
    criticalFailureCount: criticalFailures.length,
    warningCount: warnings.length,
    readyForSadu: criticalFailures.length === 0 && !failedRunStatus,
    currentFileSignature: input.fileSignature,
    blockingFindings: criticalFailures.map(({ checkId, label, recommendation, failureReason }) => ({
      checkId,
      label,
      recommendation,
      failureReason,
    })),
    warnings: warnings.map(({ checkId, label, recommendation, failureReason }) => ({
      checkId,
      label,
      recommendation,
      failureReason,
    })),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}

export function getApplicationFileSignature(application: Pick<EventApplication, "templates">) {
  const parts = application.templates
    .flatMap((template) =>
      (template.attachments ?? [])
        .filter((attachment) => attachment.reviewerVisible)
        .map((attachment) => attachmentSignaturePart(template.templateId, attachment)),
    )
    .sort();
  return parts.length ? sha256Buffer(Buffer.from(parts.join("|"), "utf8")) : "no-files";
}

function attachmentSignaturePart(templateId: string, attachment: RequirementAttachment) {
  return [
    templateId,
    attachment.id,
    attachment.fileName,
    attachment.size,
    attachment.revision,
    attachment.sha256 ?? "",
  ].join(":");
}
