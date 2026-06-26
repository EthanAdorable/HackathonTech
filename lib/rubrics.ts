export type RubricSeverity = "critical" | "warning" | "info";
export type RubricCheckMethod = "deterministic" | "ai_assisted";
export type VerificationDocumentType = "app" | "apf" | "verf";

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
  documentType: VerificationDocumentType;
  formName: string;
  label: string;
  rubricVersionId: string;
  extractionSchemaVersion: string;
  promptVersion: string;
  acceptedFormCodes: string[];
  supportedMimeTypes: string[];
  requiredFieldIds: string[];
  signatureFieldIds: string[];
  dateTimeFieldIds: string[];
  criticalChecks: RubricCheckDefinition[];
  warningChecks: RubricCheckDefinition[];
};

export const activeRubricVersionId = "app-apf-verf-rubric-v1";
export const activeExtractionSchemaVersion = "app-apf-verf-extraction-v1";
export const activePromptVersion = "app-apf-verf-prompt-v2";

export const pdfMimeType = "application/pdf";
export const jpegMimeType = "image/jpeg";
export const pngMimeType = "image/png";

export const verificationDocumentTypes = ["app", "apf", "verf"] as const;

export const supportedDocumentMimeTypes = [pdfMimeType, jpegMimeType, pngMimeType] as const;

const sharedCriticalChecks: RubricCheckDefinition[] = [
  {
    id: "source_file_supported",
    label: "Source file type is supported",
    severity: "critical",
    blocking: true,
    method: "deterministic",
    description: "The uploaded file must match the MIME types accepted by the APP/APF/VERF profile.",
  },
  {
    id: "rubric_version_current",
    label: "Rubric and extraction versions are current",
    severity: "critical",
    blocking: true,
    method: "deterministic",
    description: "Cached verification may only pass for the active rubric, schema, and prompt versions.",
  },
  {
    id: "schema_valid",
    label: "Extraction JSON matches schema",
    severity: "critical",
    blocking: true,
    method: "deterministic",
    description: "Codex-LB extraction output must validate before any results or summaries can pass.",
  },
  {
    id: "correct_document_type",
    label: "Correct document type",
    severity: "critical",
    blocking: true,
    method: "deterministic",
    description: "The extracted form must be the expected APP, APF, or VERF document.",
  },
  {
    id: "filled_not_blank",
    label: "Document is filled, not a blank template",
    severity: "critical",
    blocking: true,
    method: "deterministic",
    description: "Blank templates are recognized but cannot satisfy a required submission slot.",
  },
  {
    id: "required_fields_present",
    label: "Required rubric fields are present",
    severity: "critical",
    blocking: true,
    method: "deterministic",
    description: "Required profile fields must be present and backed by evidence.",
  },
  {
    id: "required_values_complete",
    label: "Required values are complete",
    severity: "critical",
    blocking: true,
    method: "deterministic",
    description: "Required values cannot be placeholders, underscores, default zeroes, or template labels.",
  },
  {
    id: "dates_times_parseable",
    label: "Dates and times are parseable",
    severity: "critical",
    blocking: true,
    method: "deterministic",
    description: "Start, end, ingress, and egress fields must contain reviewable dates or times.",
  },
  {
    id: "time_order_consistent",
    label: "Time ranges are internally consistent",
    severity: "critical",
    blocking: true,
    method: "deterministic",
    description: "End times cannot precede start times, and egress cannot precede ingress.",
  },
  {
    id: "signatures_detected",
    label: "Required signatures or acknowledgements are detected",
    severity: "critical",
    blocking: true,
    method: "deterministic",
    description: "Required preparer, requester, reviewer, or acknowledgement signatures must be present.",
  },
];

const sharedWarningChecks: RubricCheckDefinition[] = [
  {
    id: "low_confidence_evidence",
    label: "Low-confidence evidence needs review",
    severity: "warning",
    blocking: false,
    method: "ai_assisted",
    description: "Low OCR or extraction confidence should be surfaced to SADU without blocking by itself.",
  },
  {
    id: "venue_name_compatible",
    label: "Venue naming is reviewable",
    severity: "warning",
    blocking: false,
    method: "deterministic",
    description: "Minor naming differences such as MPR versus Multi Purpose Room should be visible to reviewers.",
  },
];

export const documentRubricProfiles: DocumentRubricProfile[] = [
  {
    id: `app-${activeRubricVersionId}`,
    documentType: "app",
    formName: "Activity / Program Proposal",
    label: "APP - Activity / Program Proposal",
    rubricVersionId: activeRubricVersionId,
    extractionSchemaVersion: activeExtractionSchemaVersion,
    promptVersion: activePromptVersion,
    acceptedFormCodes: ["FEUA-FO-FIN-ACC-005/012623/Rev1", "FEUA-FO-FIN-ACC-005"],
    supportedMimeTypes: [pdfMimeType],
    requiredFieldIds: [
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
      "preparedBy",
    ],
    signatureFieldIds: ["preparedBy"],
    dateTimeFieldIds: ["submissionDate", "startDateTime", "endDateTime"],
    criticalChecks: [
      ...sharedCriticalChecks,
      {
        id: "app_page2_required_when_cash_advance",
        label: "APP page 2 is present when cash advance details are required",
        severity: "critical",
        blocking: true,
        method: "deterministic",
        description: "APP page 2 is optional unless cash advance or page-2-only funding detail evidence is present.",
      },
    ],
    warningChecks: [
      ...sharedWarningChecks,
      {
        id: "app_page2_optional_absent",
        label: "APP page 2 optional section is absent",
        severity: "warning",
        blocking: false,
        method: "deterministic",
        description: "A one-page APP can proceed when no cash advance or page-2-only funding requirement is detected.",
      },
    ],
  },
  {
    id: `apf-${activeRubricVersionId}`,
    documentType: "apf",
    formName: "Activity Profile",
    label: "APF - Activity Profile",
    rubricVersionId: activeRubricVersionId,
    extractionSchemaVersion: activeExtractionSchemaVersion,
    promptVersion: activePromptVersion,
    acceptedFormCodes: ["FEUA-FO-ACSR-SADU-017-20JUL2020-REV1"],
    supportedMimeTypes: [pdfMimeType],
    requiredFieldIds: [
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
    signatureFieldIds: ["preparedBy", "reviewedBy", "notedBy"],
    dateTimeFieldIds: ["startDateTime", "endDateTime"],
    criticalChecks: sharedCriticalChecks,
    warningChecks: sharedWarningChecks,
  },
  {
    id: `verf-${activeRubricVersionId}`,
    documentType: "verf",
    formName: "Venue and Equipment Reservation Form",
    label: "VERF - Venue and Equipment Reservation Form",
    rubricVersionId: activeRubricVersionId,
    extractionSchemaVersion: activeExtractionSchemaVersion,
    promptVersion: activePromptVersion,
    acceptedFormCodes: ["FEUA-FO-INST-FO-001/01AUG2019/REV 0", "FEUA-FO-INST-FO-001"],
    supportedMimeTypes: [pdfMimeType, jpegMimeType, pngMimeType],
    requiredFieldIds: [
      "formCode",
      "requestDate",
      "department",
      "activityDate",
      "activityTime",
      "activityName",
      "internalParticipantCount",
      "venueReservations",
      "equipmentReservations",
      "ingressDateTime",
      "egressDateTime",
      "requesterSignatureName",
      "directorSignatureName",
      "facilitiesAcknowledgement",
      "status",
    ],
    signatureFieldIds: ["requesterSignatureName", "directorSignatureName", "facilitiesAcknowledgement"],
    dateTimeFieldIds: ["requestDate", "activityDate", "activityTime", "ingressDateTime", "egressDateTime"],
    criticalChecks: sharedCriticalChecks,
    warningChecks: sharedWarningChecks,
  },
];

export function getRubricProfile(documentType: string) {
  return documentRubricProfiles.find((profile) => profile.documentType === documentType);
}

export function requireRubricProfile(documentType: string) {
  const profile = getRubricProfile(documentType);
  if (!profile) throw new Error(`No document verification rubric profile is registered for ${documentType}.`);
  return profile;
}

export function isVerificationDocumentType(documentType: string): documentType is VerificationDocumentType {
  return verificationDocumentTypes.includes(documentType as VerificationDocumentType);
}

export function isSupportedDocumentMimeType(mimeType: string, documentType?: string) {
  const profile = documentType ? getRubricProfile(documentType) : undefined;
  const accepted = profile?.supportedMimeTypes ?? [...supportedDocumentMimeTypes];
  return accepted.includes(mimeType);
}
