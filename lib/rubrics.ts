import { templateDefinitions } from "./tams-data";

export type RubricSeverity = "critical" | "warning" | "info";
export type RubricCheckMethod = "deterministic" | "ai_assisted";

export type RubricCheckDefinition = {
  id: string;
  label: string;
  severity: RubricSeverity;
  blocking: boolean;
  method: RubricCheckMethod;
  description: string;
};

export type DocumentRubricProfile = {
  id: string;
  documentType: string;
  label: string;
  rubricVersionId: string;
  extractionSchemaVersion: string;
  promptVersion: string;
  supportedMimeTypes: string[];
  requiredFieldIds: string[];
  criticalChecks: RubricCheckDefinition[];
  warningChecks: RubricCheckDefinition[];
};

export const activeRubricVersionId = "tams-placeholder-v1";
export const activeExtractionSchemaVersion = "event-document-extraction-v1";
export const activePromptVersion = "document-verification-prompt-v1";

export const supportedDocumentMimeTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
] as const;

function profileForTemplate(template: (typeof templateDefinitions)[number]): DocumentRubricProfile {
  return {
    id: `${template.id}-${activeRubricVersionId}`,
    documentType: template.id,
    label: template.attachmentRequirement?.label ?? template.name,
    rubricVersionId: activeRubricVersionId,
    extractionSchemaVersion: activeExtractionSchemaVersion,
    promptVersion: activePromptVersion,
    supportedMimeTypes: [...supportedDocumentMimeTypes],
    requiredFieldIds: template.fields.filter((field) => field.required).map((field) => field.id),
    criticalChecks: [
      {
        id: "source_file_supported",
        label: "Source file type is supported",
        severity: "critical",
        blocking: true,
        method: "deterministic",
        description: "The uploaded file must be a supported PDF, DOCX, XLSX, or CSV source document.",
      },
      {
        id: "schema_valid",
        label: "Extraction JSON matches schema",
        severity: "critical",
        blocking: true,
        method: "deterministic",
        description: "Codex-LB extraction output must validate at runtime before any verification result can pass.",
      },
      {
        id: "required_fields_present",
        label: "Required rubric fields are present",
        severity: "critical",
        blocking: true,
        method: "ai_assisted",
        description: "Required profile fields must be found or explicitly cited as missing or unknown.",
      },
    ],
    warningChecks: [
      {
        id: "low_confidence_evidence",
        label: "Evidence confidence is reviewable",
        severity: "warning",
        blocking: false,
        method: "ai_assisted",
        description: "Low-confidence extracted facts should be surfaced for SADU review without blocking submission.",
      },
    ],
  };
}

export const documentRubricProfiles = templateDefinitions.map(profileForTemplate);

export function getRubricProfile(documentType: string) {
  return documentRubricProfiles.find((profile) => profile.documentType === documentType);
}

export function requireRubricProfile(documentType: string) {
  const profile = getRubricProfile(documentType);
  if (!profile) throw new Error(`No document verification rubric profile is registered for ${documentType}.`);
  return profile;
}

export function isSupportedDocumentMimeType(mimeType: string) {
  return supportedDocumentMimeTypes.includes(mimeType as (typeof supportedDocumentMimeTypes)[number]);
}
