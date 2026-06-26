import { createHash } from "node:crypto";
import {
  activeExtractionSchemaVersion,
  activePromptVersion,
  activeRubricVersionId,
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
export type ExtractionCompletenessStatus = "filled" | "blank_or_incomplete";
export type ExtractionMode = "text_pdf" | "text_docx" | "text_xlsx" | "text_csv" | "vision_ocr" | "weak_pdf_vision";

export type ExtractedField = {
  fieldId: string;
  label: string;
  value: string | number | boolean | string[] | Record<string, unknown>[] | null;
  confidence: number;
  evidence: string[];
  sourceLocations: string[];
};

export type DocumentExtraction = {
  documentType: string;
  schemaVersion: string;
  completenessStatus: ExtractionCompletenessStatus;
  extractionMode?: ExtractionMode;
  formCode?: string | null;
  formVersion?: string | null;
  pageCount?: number;
  hasPage2?: boolean;
  documentData?: Record<string, unknown>;
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
  documentType?: string;
};

export type DocumentVerificationSummary = {
  documentType: string;
  status: VerificationRunStatus;
  fieldCount: number;
  confidence: number;
  extractionMode?: ExtractionMode;
  completedAt?: string;
  blockerCount: number;
  warningCount: number;
};

export type CompiledVerificationSummary = {
  status: VerificationRunStatus;
  rubricVersionId: string;
  documentCount: number;
  criticalFailureCount: number;
  warningCount: number;
  readyForSadu: boolean;
  currentFileSignature: string;
  blockingFindings: Array<Pick<VerificationResult, "checkId" | "label" | "recommendation" | "failureReason" | "documentType">>;
  warnings: Array<Pick<VerificationResult, "checkId" | "label" | "recommendation" | "failureReason" | "documentType">>;
  documentSummaries: DocumentVerificationSummary[];
  crossDocumentResults: VerificationResult[];
  generatedAt: string;
};

export type DocumentExtractionSchema = {
  documentType: "app" | "apf" | "verf";
  schemaVersion: string;
  fields: string[];
  arrays: string[];
  optionalFields: string[];
};

export const documentExtractionSchemas: Record<"app" | "apf" | "verf", DocumentExtractionSchema> = {
  app: {
    documentType: "app",
    schemaVersion: activeExtractionSchemaVersion,
    fields: [
      "formCode",
      "apfNumber",
      "programTitle",
      "submissionDate",
      "startDateTime",
      "endDateTime",
      "venue",
      "objectives",
      "budgetCategories",
      "totalProposedBudget",
      "approvedBy",
      "budgetReviewedBy",
      "recommendedBy",
      "proposedBy",
      "preparedBy",
    ],
    arrays: ["objectives", "budgetCategories"],
    optionalFields: ["approvedBy", "budgetReviewedBy", "recommendedBy", "proposedBy", "cashAdvanceRequested", "page2FundingDetails"],
  },
  apf: {
    documentType: "apf",
    schemaVersion: activeExtractionSchemaVersion,
    fields: [
      "formCode",
      "activityTitle",
      "venue",
      "startDateTime",
      "endDateTime",
      "targetParticipantCount",
      "activityOverview",
      "mainObjectives",
      "specificObjectives",
      "programmeRows",
      "activityDescription",
      "targetParticipants",
      "expenseSections",
      "revenueSections",
      "workingCommittees",
      "preparedBy",
      "reviewedBy",
      "notedBy",
    ],
    arrays: ["specificObjectives", "programmeRows", "expenseSections", "revenueSections", "workingCommittees"],
    optionalFields: [],
  },
  verf: {
    documentType: "verf",
    schemaVersion: activeExtractionSchemaVersion,
    fields: [
      "formCode",
      "requestDate",
      "department",
      "activityDate",
      "activityTime",
      "activityName",
      "internalParticipantCount",
      "externalParticipantCount",
      "venueReservations",
      "equipmentReservations",
      "ingressDateTime",
      "egressDateTime",
      "additionalManpower",
      "supportingDocuments",
      "requesterSignatureName",
      "directorSignatureName",
      "facilitiesAcknowledgement",
      "status",
    ],
    arrays: ["venueReservations", "equipmentReservations", "additionalManpower", "supportingDocuments"],
    optionalFields: ["externalParticipantCount", "additionalManpower", "supportingDocuments"],
  },
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

export function validateExtractionJson(
  value: unknown,
): { ok: true; extraction: DocumentExtraction } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Extraction must be a JSON object." };
  const candidate = value as Partial<DocumentExtraction>;
  if (typeof candidate.documentType !== "string") return { ok: false, error: "documentType is required." };
  if (candidate.schemaVersion !== activeExtractionSchemaVersion) {
    return { ok: false, error: `schemaVersion must be ${activeExtractionSchemaVersion}.` };
  }
  if (candidate.completenessStatus !== "filled" && candidate.completenessStatus !== "blank_or_incomplete") {
    return { ok: false, error: "completenessStatus must be filled or blank_or_incomplete." };
  }
  if (candidate.extractionMode && !["text_pdf", "text_docx", "text_xlsx", "text_csv", "vision_ocr", "weak_pdf_vision"].includes(candidate.extractionMode)) {
    return { ok: false, error: "extractionMode is not recognized." };
  }
  if (candidate.documentData && (typeof candidate.documentData !== "object" || Array.isArray(candidate.documentData))) {
    return { ok: false, error: "documentData must be an object when provided." };
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

  const typedError = validateDocumentData(candidate.documentType, candidate.documentData);
  if (typedError) return { ok: false, error: typedError };

  return { ok: true, extraction: candidate as DocumentExtraction };
}

function validateDocumentData(documentType: string, data?: Record<string, unknown>) {
  if (!data) return undefined;
  const schema = documentExtractionSchemas[documentType as keyof typeof documentExtractionSchemas];
  if (!schema) return `documentType ${documentType} is not supported by the APP/APF/VERF extraction schema registry.`;
  for (const field of schema.arrays) {
    if (data[field] !== undefined && !Array.isArray(data[field])) return `${field} must be an array.`;
  }
  for (const field of ["targetParticipantCount", "internalParticipantCount", "externalParticipantCount", "totalProposedBudget"]) {
    if (data[field] !== undefined && typeof data[field] !== "number" && typeof data[field] !== "string") {
      return `${field} must be a number or numeric string.`;
    }
  }
  return undefined;
}

export function runDeterministicVerification(input: {
  profile: DocumentRubricProfile;
  mimeType: string;
  extraction?: DocumentExtraction;
  extractionError?: string;
  rubricVersionId?: string;
  extractionSchemaVersion?: string;
  promptVersion?: string;
}): VerificationResult[] {
  const results: VerificationResult[] = [];
  const documentType = input.profile.documentType;
  const supported = isSupportedDocumentMimeType(input.mimeType, documentType);
  results.push(result({
    documentType,
    checkId: "source_file_supported",
    label: `${input.profile.label}: source file type is supported`,
    status: supported ? "pass" : "fail",
    severity: "critical",
    blocking: !supported,
    evidence: [`MIME type: ${input.mimeType}`, `Accepted: ${input.profile.supportedMimeTypes.join(", ")}`],
    recommendation: supported ? "No action needed." : `Upload ${input.profile.label} as ${input.profile.supportedMimeTypes.join(", ")}.`,
    method: "deterministic",
    confidence: 1,
    failureReason: supported ? undefined : "Unsupported MIME type.",
  }));

  const versionsCurrent =
    (input.rubricVersionId ?? input.profile.rubricVersionId) === input.profile.rubricVersionId &&
    (input.extractionSchemaVersion ?? input.profile.extractionSchemaVersion) === input.profile.extractionSchemaVersion &&
    (input.promptVersion ?? input.profile.promptVersion) === input.profile.promptVersion;
  results.push(result({
    documentType,
    checkId: "rubric_version_current",
    label: `${input.profile.label}: rubric and extraction versions are current`,
    status: versionsCurrent ? "pass" : "fail",
    severity: "critical",
    blocking: !versionsCurrent,
    evidence: [
      `rubric=${input.rubricVersionId ?? input.profile.rubricVersionId}`,
      `schema=${input.extractionSchemaVersion ?? input.profile.extractionSchemaVersion}`,
      `prompt=${input.promptVersion ?? input.profile.promptVersion}`,
    ],
    recommendation: versionsCurrent ? "No action needed." : "Re-run verification with the active APP/APF/VERF rubric versions.",
    method: "deterministic",
    confidence: 1,
    failureReason: versionsCurrent ? undefined : "Stale rubric, schema, or prompt version.",
  }));

  const schemaValid = Boolean(input.extraction && !input.extractionError);
  results.push(result({
    documentType,
    checkId: "schema_valid",
    label: `${input.profile.label}: extraction JSON matches schema`,
    status: schemaValid ? "pass" : "fail",
    severity: "critical",
    blocking: !schemaValid,
    evidence: schemaValid ? [`Schema version: ${input.extraction?.schemaVersion}`] : [input.extractionError ?? "Extraction was not produced."],
    recommendation: schemaValid ? "No action needed." : "Retry verification after Codex-LB is available and returns valid APP/APF/VERF JSON.",
    method: "deterministic",
    confidence: 1,
    failureReason: schemaValid ? undefined : input.extractionError ?? "Missing extraction.",
  }));

  if (!input.extraction) return results;

  const extraction = input.extraction;
  const correctType = extraction.documentType === documentType;
  results.push(result({
    documentType,
    checkId: "correct_document_type",
    label: `${input.profile.label}: correct document type`,
    status: correctType ? "pass" : "fail",
    severity: "critical",
    blocking: !correctType,
    evidence: [`Expected ${documentType}; extracted ${extraction.documentType}.`],
    recommendation: correctType ? "No action needed." : `Upload the ${input.profile.formName} in the ${input.profile.label} slot.`,
    method: "deterministic",
    confidence: extraction.confidence,
    failureReason: correctType ? undefined : "Document type mismatch.",
  }));

  const filled = extraction.completenessStatus === "filled";
  results.push(result({
    documentType,
    checkId: "filled_not_blank",
    label: `${input.profile.label}: document is filled, not a blank template`,
    status: filled ? "pass" : "fail",
    severity: "critical",
    blocking: !filled,
    evidence: extraction.evidence.length ? extraction.evidence.slice(0, 4) : ["Extraction marked the form blank or incomplete."],
    recommendation: filled ? "No action needed." : `Upload a completed ${input.profile.formName}; blank templates cannot be submitted to SADU.`,
    method: "deterministic",
    confidence: extraction.confidence,
    failureReason: filled ? undefined : "Blank or incomplete form.",
  }));

  const extractedFieldIds = new Set([
    ...extraction.normalizedFields.map((field) => field.fieldId),
    ...Object.keys(extraction.documentData ?? {}),
  ]);
  const missingCritical = input.profile.requiredFieldIds.filter((fieldId) => !extractedFieldIds.has(fieldId));
  results.push(result({
    documentType,
    checkId: "required_fields_present",
    label: `${input.profile.label}: required rubric fields are present`,
    status: missingCritical.length ? "fail" : "pass",
    severity: "critical",
    blocking: missingCritical.length > 0,
    evidence: missingCritical.length ? missingCritical.map((fieldId) => `Missing field: ${fieldId}`) : ["All required APP/APF/VERF fields were extracted."],
    recommendation: missingCritical.length
      ? "Upload a complete source document or revise the document so required details are stated clearly."
      : "No action needed.",
    method: "deterministic",
    confidence: extraction.confidence,
    failureReason: missingCritical.length ? "Required fields were missing from the extraction output." : undefined,
  }));

  const placeholderFields = input.profile.requiredFieldIds.filter((fieldId) => isPlaceholderValue(fieldValue(extraction, fieldId)));
  results.push(result({
    documentType,
    checkId: "required_values_complete",
    label: `${input.profile.label}: required values are complete`,
    status: placeholderFields.length ? "fail" : "pass",
    severity: "critical",
    blocking: placeholderFields.length > 0,
    evidence: placeholderFields.length ? placeholderFields.map((fieldId) => `Placeholder or empty value: ${fieldId}`) : ["Required values are not blank placeholders."],
    recommendation: placeholderFields.length ? "Replace placeholders, underscores, default zeroes, and template labels with final filing values." : "No action needed.",
    method: "deterministic",
    confidence: extraction.confidence,
    failureReason: placeholderFields.length ? "Required values were placeholders or empty." : undefined,
  }));

  const badDateFields = input.profile.dateTimeFieldIds.filter((fieldId) => {
    const value = fieldValue(extraction, fieldId);
    return !isReviewableDateOrTime(value);
  });
  results.push(result({
    documentType,
    checkId: "dates_times_parseable",
    label: `${input.profile.label}: dates and times are parseable`,
    status: badDateFields.length ? "fail" : "pass",
    severity: "critical",
    blocking: badDateFields.length > 0,
    evidence: badDateFields.length ? badDateFields.map((fieldId) => `Unparseable date/time: ${fieldId}`) : ["Date and time fields contain reviewable values."],
    recommendation: badDateFields.length ? "Provide readable dates and times for SADU and Facilities review." : "No action needed.",
    method: "deterministic",
    confidence: extraction.confidence,
    failureReason: badDateFields.length ? "Date/time values were missing or unparseable." : undefined,
  }));

  const timeOrder = timeOrderIssue(extraction);
  results.push(result({
    documentType,
    checkId: "time_order_consistent",
    label: `${input.profile.label}: time ranges are internally consistent`,
    status: timeOrder ? "fail" : "pass",
    severity: "critical",
    blocking: Boolean(timeOrder),
    evidence: timeOrder ? [timeOrder] : ["No reversed start/end or ingress/egress range was detected."],
    recommendation: timeOrder ? "Correct the reversed time range before submission." : "No action needed.",
    method: "deterministic",
    confidence: extraction.confidence,
    failureReason: timeOrder,
  }));

  const missingSignatures = input.profile.signatureFieldIds.filter((fieldId) => isPlaceholderValue(fieldValue(extraction, fieldId)));
  results.push(result({
    documentType,
    checkId: "signatures_detected",
    label: `${input.profile.label}: required signatures or acknowledgements are detected`,
    status: missingSignatures.length ? "fail" : "pass",
    severity: "critical",
    blocking: missingSignatures.length > 0,
    evidence: missingSignatures.length ? missingSignatures.map((fieldId) => `Missing signature or acknowledgement: ${fieldId}`) : ["Required signature/acknowledgement fields contain evidence."],
    recommendation: missingSignatures.length ? "Collect required signatures or acknowledgement before SADU submission." : "No action needed.",
    method: "deterministic",
    confidence: extraction.confidence,
    failureReason: missingSignatures.length ? "Required signature evidence was missing." : undefined,
  }));

  if (documentType === "app") {
    const cashAdvanceRequested = Boolean(fieldValue(extraction, "cashAdvanceRequested")) ||
      /cash advance/i.test(String(fieldValue(extraction, "page2FundingDetails") ?? ""));
    const needsPage2 = cashAdvanceRequested || Boolean(fieldValue(extraction, "page2FieldsRequired"));
    const hasPage2 = extraction.hasPage2 !== false;
    if (needsPage2 || !hasPage2) {
      results.push(result({
        documentType,
        checkId: needsPage2 ? "app_page2_required_when_cash_advance" : "app_page2_optional_absent",
        label: needsPage2
          ? "APP: page 2 is present when cash advance details are required"
          : "APP: page 2 optional section is absent",
        status: needsPage2 && !hasPage2 ? "fail" : needsPage2 ? "pass" : "warning",
        severity: needsPage2 ? "critical" : "warning",
        blocking: needsPage2 && !hasPage2,
        evidence: [`hasPage2=${String(hasPage2)}`, `cashAdvanceRequested=${String(cashAdvanceRequested)}`],
        recommendation: needsPage2 && !hasPage2
          ? "Upload APP page 2 because cash advance or page-2-only funding details are required."
          : "No blocker; SADU can review the one-page APP because no cash advance requirement was detected.",
        method: "deterministic",
        confidence: extraction.confidence,
        failureReason: needsPage2 && !hasPage2 ? "APP page 2 is conditionally required." : undefined,
      }));
    }
  }

  const lowConfidence = extraction.normalizedFields.filter((field) => field.confidence < 0.72);
  if (extraction.confidence < 0.72 || lowConfidence.length) {
    results.push(result({
      documentType,
      checkId: "low_confidence_evidence",
      label: `${input.profile.label}: low-confidence evidence needs review`,
      status: "warning",
      severity: "warning",
      blocking: false,
      evidence: lowConfidence.length
        ? lowConfidence.slice(0, 4).map((field) => `${field.label}: ${Math.round(field.confidence * 100)}% confidence`)
        : [`Overall confidence: ${Math.round(extraction.confidence * 100)}%`],
      recommendation: "SADU should review low-confidence OCR or extraction evidence before final approval.",
      method: "ai_assisted",
      confidence: lowConfidence.length ? Math.min(...lowConfidence.map((field) => field.confidence)) : extraction.confidence,
    }));
  }

  return results;
}

export function runCrossDocumentVerification(extractions: DocumentExtraction[]): VerificationResult[] {
  const filled = extractions.filter((extraction) => extraction.completenessStatus === "filled");
  if (filled.length < 2) return [];
  return [
    compatibleTextResult("cross_title_compatible", "APP/APF/VERF event titles are compatible", filled, [
      ["app", "programTitle"],
      ["apf", "activityTitle"],
      ["verf", "activityName"],
    ]),
    compatibleDateResult(filled),
    compatibleTextResult("cross_venue_compatible", "APP/APF/VERF venues are compatible", filled, [
      ["app", "venue"],
      ["apf", "venue"],
      ["verf", "venueReservations"],
    ], normalizeVenue),
    compatibleNumberResult("cross_participants_compatible", "APP/APF/VERF participant counts are compatible", filled, [
      ["apf", "targetParticipantCount"],
      ["verf", "internalParticipantCount"],
    ], 25),
    compatibleNumberResult("cross_budget_compatible", "APP and APF budget totals are compatible", filled, [
      ["app", "totalProposedBudget"],
      ["apf", "totalBudget"],
    ], 1),
  ].filter(Boolean) as VerificationResult[];
}

export function compileVerificationSummary(input: {
  rubricVersionId: string;
  documentCount: number;
  fileSignature: string;
  results: VerificationResult[];
  runStatuses?: VerificationRunStatus[];
  documentSummaries?: DocumentVerificationSummary[];
  generatedAt?: string;
}): CompiledVerificationSummary {
  const crossDocumentResults = input.results.filter((result) => result.checkId.startsWith("cross_"));
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
    blockingFindings: criticalFailures.map(({ checkId, label, recommendation, failureReason, documentType }) => ({
      checkId,
      label,
      recommendation,
      failureReason,
      documentType,
    })),
    warnings: warnings.map(({ checkId, label, recommendation, failureReason, documentType }) => ({
      checkId,
      label,
      recommendation,
      failureReason,
      documentType,
    })),
    documentSummaries: input.documentSummaries ?? [],
    crossDocumentResults,
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

export function extractionFromFields(input: {
  documentType: string;
  completenessStatus: ExtractionCompletenessStatus;
  fields: Record<string, unknown>;
  evidence?: string[];
  sourceLocations?: string[];
  confidence?: number;
  hasPage2?: boolean;
  pageCount?: number;
  extractionMode?: ExtractionMode;
}): DocumentExtraction {
  const normalizedFields = Object.entries(input.fields).map(([fieldId, value]) => ({
    fieldId,
    label: fieldId,
    value: normalizeFieldValue(value),
    confidence: input.confidence ?? 0.9,
    evidence: input.evidence ?? [`${fieldId}: ${String(value)}`],
    sourceLocations: input.sourceLocations ?? ["fixture"],
  }));
  return {
    documentType: input.documentType,
    schemaVersion: activeExtractionSchemaVersion,
    completenessStatus: input.completenessStatus,
    extractionMode: input.extractionMode,
    documentData: input.fields,
    formCode: typeof input.fields.formCode === "string" ? input.fields.formCode : null,
    pageCount: input.pageCount,
    hasPage2: input.hasPage2,
    normalizedFields,
    missingFields: [],
    unknownFields: [],
    confidence: input.confidence ?? 0.9,
    evidence: input.evidence ?? [],
    sourceLocations: input.sourceLocations ?? [],
  };
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

function result(input: VerificationResult): VerificationResult {
  return input;
}

function normalizeFieldValue(value: unknown): ExtractedField["value"] {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) return value as string[];
    if (value.every((item) => item && typeof item === "object")) return value as Record<string, unknown>[];
    return value.map((item) => String(item));
  }
  if (typeof value === "object") return [value as Record<string, unknown>];
  return String(value);
}

function fieldValue(extraction: DocumentExtraction, fieldId: string): unknown {
  if (extraction.documentData && fieldId in extraction.documentData) return extraction.documentData[fieldId];
  return extraction.normalizedFields.find((field) => field.fieldId === fieldId)?.value;
}

function isPlaceholderValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return !Number.isFinite(value) || value === 0;
  if (Array.isArray(value)) return value.length === 0 || value.every(isPlaceholderValue);
  if (typeof value === "object") return Object.values(value).every(isPlaceholderValue);
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return true;
  if (/^[_\-\s.]+$/.test(normalized)) return true;
  if (/^(n\/a|na|none|null|undefined|to be filled|for ao'?s use only)$/.test(normalized)) return true;
  if (/^p?0+[,.]0+$/.test(normalized)) return true;
  if (/^#?\s*_+$/.test(normalized)) return true;
  return false;
}

function isReviewableDateOrTime(value: unknown): boolean {
  if (isPlaceholderValue(value)) return false;
  const text = Array.isArray(value) ? value.join(" ") : String(value);
  return /\d{1,2}(:\d{2})?\s*(am|pm)?/i.test(text) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4})/i.test(text);
}

function timeOrderIssue(extraction: DocumentExtraction) {
  const start = valueToDate(fieldValue(extraction, "startDateTime"));
  const end = valueToDate(fieldValue(extraction, "endDateTime"));
  if (start && end && end.getTime() < start.getTime()) return "End date/time is before start date/time.";
  const ingress = valueToDate(fieldValue(extraction, "ingressDateTime"));
  const egress = valueToDate(fieldValue(extraction, "egressDateTime"));
  if (ingress && egress && egress.getTime() < ingress.getTime()) return "Egress date/time is before ingress date/time.";
  return undefined;
}

function valueToDate(value: unknown) {
  if (isPlaceholderValue(value)) return null;
  const text = Array.isArray(value) ? value.join(" ") : String(value);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function compatibleTextResult(
  checkId: string,
  label: string,
  extractions: DocumentExtraction[],
  fields: Array<[string, string]>,
  normalizer: (value: string) => string = normalizeComparableText,
): VerificationResult | null {
  const values = fields
    .map(([documentType, field]) => {
      const extraction = extractions.find((item) => item.documentType === documentType);
      const value = extraction ? fieldValue(extraction, field) : undefined;
      return value === undefined ? null : { documentType, value: Array.isArray(value) ? value.join(" ") : String(value) };
    })
    .filter(Boolean) as Array<{ documentType: string; value: string }>;
  if (values.length < 2) return null;
  const normalized = values.map((item) => normalizer(item.value)).filter(Boolean);
  const compatible = normalized.every((value) => normalized.some((other) => value === other || value.includes(other) || other.includes(value)));
  return result({
    checkId,
    label,
    status: compatible ? "pass" : "warning",
    severity: "warning",
    blocking: false,
    evidence: values.map((item) => `${item.documentType}: ${item.value}`),
    recommendation: compatible ? "No action needed." : "SADU should confirm whether the naming difference refers to the same event or venue.",
    method: "deterministic",
    confidence: 0.86,
  });
}

function compatibleDateResult(extractions: DocumentExtraction[]): VerificationResult | null {
  const appExtraction = extractions.find((item) => item.documentType === "app");
  const apfExtraction = extractions.find((item) => item.documentType === "apf");
  const verfExtraction = extractions.find((item) => item.documentType === "verf");
  const values = [
    ["app", appExtraction ? fieldValue(appExtraction, "startDateTime") : undefined],
    ["apf", apfExtraction ? fieldValue(apfExtraction, "startDateTime") : undefined],
    ["verf", verfExtraction ? fieldValue(verfExtraction, "activityDate") : undefined],
  ].filter((item) => item[1] !== undefined) as Array<[string, unknown]>;
  if (values.length < 2) return null;
  const days = values.map(([, value]) => dateKey(value)).filter(Boolean);
  const uniqueDays = new Set(days);
  const compatible = uniqueDays.size <= 1;
  return result({
    checkId: "cross_datetime_compatible",
    label: "APP/APF/VERF dates and times are compatible",
    status: compatible ? "pass" : "warning",
    severity: "warning",
    blocking: false,
    evidence: values.map(([documentType, value]) => `${documentType}: ${String(value)}`),
    recommendation: compatible ? "No action needed." : "SADU should reconcile date/time differences or confirm setup versus activity dates.",
    method: "deterministic",
    confidence: 0.84,
  });
}

function compatibleNumberResult(
  checkId: string,
  label: string,
  extractions: DocumentExtraction[],
  fields: Array<[string, string]>,
  tolerance: number,
): VerificationResult | null {
  const values = fields
    .map(([documentType, field]) => {
      const extraction = extractions.find((item) => item.documentType === documentType);
      const parsed = parseAmount(extraction ? fieldValue(extraction, field) : undefined);
      return parsed === null ? null : { documentType, value: parsed };
    })
    .filter(Boolean) as Array<{ documentType: string; value: number }>;
  if (values.length < 2) return null;
  const min = Math.min(...values.map((item) => item.value));
  const max = Math.max(...values.map((item) => item.value));
  const compatible = max - min <= tolerance;
  return result({
    checkId,
    label,
    status: compatible ? "pass" : tolerance <= 1 ? "fail" : "warning",
    severity: compatible ? "info" : tolerance <= 1 ? "critical" : "warning",
    blocking: !compatible && tolerance <= 1,
    evidence: values.map((item) => `${item.documentType}: ${item.value}`),
    recommendation: compatible ? "No action needed." : "Reconcile the inconsistent numeric values before submission or SADU decision.",
    method: "deterministic",
    confidence: 0.9,
    failureReason: compatible ? undefined : "Cross-document numeric mismatch.",
  });
}

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(the|and|for|of)\b/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeVenue(value: string) {
  return normalizeComparableText(value)
    .replace(/\bmulti purpose room\b/g, "mpr")
    .replace(/\bmpr\s+20[345]\b/g, "mpr")
    .replace(/\bmpr\b/g, "mpr");
}

function dateKey(value: unknown) {
  if (!value) return "";
  const text = Array.isArray(value) ? value.join(" ") : String(value);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const monthMatch = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/i);
  if (monthMatch) return `${monthMatch[3]}-${monthNumber(monthMatch[1])}-${monthMatch[2].padStart(2, "0")}`;
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function monthNumber(month: string) {
  return String(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(month.slice(0, 3).toLowerCase()) + 1).padStart(2, "0");
}

function parseAmount(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const match = String(value).replace(/,/g, "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}
