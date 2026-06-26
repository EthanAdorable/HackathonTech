import {
  makePolicyChecklist,
  makePolicyRevisionDraft,
  makePolicySummary,
} from "./sadu-guide-policy";

export type Role = "Student Officer" | "SADU Associate" | "Faculty Adviser" | "Admin";

export type EventStatus =
  | "Draft"
  | "Template Completion"
  | "AI Pre-check"
  | "Pending Adviser Endorsement"
  | "Submitted to SADU"
  | "Under Review"
  | "Revision Requested"
  | "Resubmitted"
  | "SADU Approved"
  | "Rejected"
  | "Archived";

export type FieldType = "text" | "date" | "number" | "textarea" | "select";

export type TemplateField = {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
};

export type TemplateDefinition = {
  id: string;
  name: string;
  description: string;
  attachmentRequirement?: {
    label: string;
    required: boolean;
    reviewerVisible: boolean;
  };
  fields: TemplateField[];
};

export type RequirementAttachmentVersion = {
  id: string;
  fileName: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  revision: number;
  note?: string;
};

export type RequirementAttachment = RequirementAttachmentVersion & {
  attachmentId?: string;
  mimeType: string;
  sha256?: string;
  status: "uploaded" | "needs-revision" | "accepted";
  reviewerVisible: boolean;
  reviewNote?: string;
  verificationStatus?: string;
  versions: RequirementAttachmentVersion[];
};

export type VerificationSummaryFinding = {
  checkId: string;
  label: string;
  recommendation: string;
  failureReason?: string;
};

export type ApplicationVerificationSummary = {
  id?: string;
  status:
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
  rubricVersionId: string;
  documentCount: number;
  criticalFailureCount: number;
  warningCount: number;
  readyForSadu: boolean;
  currentFileSignature: string;
  blockingFindings: VerificationSummaryFinding[];
  warnings: VerificationSummaryFinding[];
  documentSummaries?: Array<{
    documentType: string;
    status: string;
    fieldCount: number;
    confidence: number;
    extractionMode?: string;
    completedAt?: string;
    blockerCount: number;
    warningCount: number;
  }>;
  crossDocumentResults?: Array<{
    checkId: string;
    label: string;
    status: string;
    severity: string;
    evidence: string[];
    recommendation: string;
  }>;
  generatedAt: string;
};

export type TemplateEntry = {
  id?: string;
  templateDocumentId?: string;
  templateId: string;
  values: Record<string, string>;
  enabled: boolean;
  attachments?: RequirementAttachment[];
  requirements?: Array<{
    id: string;
    requirementId?: string;
    label?: string;
  }>;
};

export type Message = {
  id: string;
  author: string;
  role: Role;
  body: string;
  createdAt: string;
  actorId?: string;
  actorName?: string;
  actorRole?: Role;
};

export type TimelineEntry = {
  id: string;
  status: EventStatus;
  note: string;
  createdAt: string;
  actorId?: string;
  actorName?: string;
  actorRole?: Role;
};

export type AdviserEndorsement = {
  required: boolean;
  state: "Not Required" | "Pending" | "Endorsed";
  actorId?: string;
  actorName?: string;
  actorRole?: Role;
  timestamp?: string;
  notes?: string;
};

export type EventApplication = {
  id: string;
  title: string;
  organization: string;
  eventType: string;
  venue: string;
  eventDate: string;
  expectedParticipants: number;
  ownerId: string;
  adviserId: string;
  status: EventStatus;
  riskLevel: "Low" | "Medium" | "High";
  templates: TemplateEntry[];
  adviserEndorsement: AdviserEndorsement;
  messages: Message[];
  timeline: TimelineEntry[];
  verificationSummary?: ApplicationVerificationSummary | null;
};

export type DemoUser = {
  id: string;
  name: string;
  role: Role;
  organization?: string;
  title: string;
  permissions?: string[];
};

export const users: DemoUser[] = [
  {
    id: "juan",
    name: "Juan Reyes",
    role: "Student Officer",
    organization: "Junior Philippine Computer Society",
    title: "Secretary of JPCS",
    permissions: ["events:create", "events:edit-own", "events:submit-own", "messages:create"],
  },
  {
    id: "sadu",
    name: "SADU Associate",
    role: "SADU Associate",
    title: "Student Activities Review Desk",
    permissions: ["events:review", "events:request-revision", "events:decide", "messages:create"],
  },
  {
    id: "adviser",
    name: "Faculty Adviser",
    role: "Faculty Adviser",
    organization: "Junior Philippine Computer Society",
    title: "Organization Adviser",
    permissions: ["events:view-advised", "events:endorse", "messages:create"],
  },
  {
    id: "admin",
    name: "Admin",
    role: "Admin",
    title: "Campus System Administrator",
    permissions: ["admin:templates", "admin:users", "admin:roles", "admin:audit", "events:view-all"],
  },
];

export const statuses: EventStatus[] = [
  "Draft",
  "Template Completion",
  "AI Pre-check",
  "Pending Adviser Endorsement",
  "Submitted to SADU",
  "Under Review",
  "Revision Requested",
  "Resubmitted",
  "SADU Approved",
  "Rejected",
  "Archived",
];

export const templateDefinitions: TemplateDefinition[] = [
  {
    id: "app",
    name: "APP FORM",
    description: "Activity / Program Proposal with event scope, schedule, venue, budget, and approvals.",
    attachmentRequirement: { label: "APP FORM", required: true, reviewerVisible: true },
    fields: [],
  },
  {
    id: "apf",
    name: "APF FORM",
    description: "Activity Profile with objectives, programme, participants, budget, committees, and signatories.",
    attachmentRequirement: { label: "APF FORM", required: true, reviewerVisible: true },
    fields: [],
  },
  {
    id: "verf",
    name: "VERF FORM",
    description: "Venue and Equipment Reservation Form with facilities, equipment, setup, and acknowledgement evidence.",
    attachmentRequirement: { label: "VERF FORM", required: true, reviewerVisible: true },
    fields: [],
  },
  {
    id: "speaker",
    name: "Speaker guest request (optional)",
    description: "Guest profile, invitation status, and contact details.",
    attachmentRequirement: { label: "Speaker guest request", required: false, reviewerVisible: true },
    fields: [
      { id: "guestName", label: "Guest name", type: "text", required: false },
      { id: "guestAffiliation", label: "Guest affiliation", type: "text", required: false },
      { id: "invitationStatus", label: "Invitation status", type: "select", required: false, options: ["Not needed", "Drafted", "Sent", "Confirmed"] },
    ],
  },
  {
    id: "publicity",
    name: "Publicity Publication Post (optional)",
    description: "Promotional channels, publication timing, and collateral notes.",
    attachmentRequirement: { label: "Publicity Publication Post", required: false, reviewerVisible: true },
    fields: [
      { id: "channels", label: "Publication channels", type: "textarea", required: false },
      { id: "postingDate", label: "Target posting date", type: "date", required: false },
      { id: "materials", label: "Materials needed", type: "textarea", required: false },
    ],
  },
];

function attachment(
  templateId: string,
  fileName: string,
  size: number,
  uploadedAt: string,
  uploadedBy = "Juan Reyes",
  revision = 1,
  status: RequirementAttachment["status"] = "uploaded",
  reviewNote?: string,
): RequirementAttachment {
  const version: RequirementAttachmentVersion = {
    id: `${templateId}-v${revision}`,
    fileName,
    size,
    uploadedAt,
    uploadedBy,
    revision,
    note: revision > 1 ? "Replacement uploaded after SADU revision." : "Initial upload.",
  };

  return {
    ...version,
    id: `${templateId}-attachment`,
    mimeType: fileName.endsWith(".xlsx")
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")
        ? "image/jpeg"
        : fileName.endsWith(".png")
          ? "image/png"
          : "application/pdf",
    status,
    reviewerVisible: templateDefinitions.find((template) => template.id === templateId)?.attachmentRequirement?.reviewerVisible ?? true,
    reviewNote,
    versions:
      revision > 1
        ? [
            { ...version, id: `${templateId}-v1`, fileName: fileName.replace("revised-", ""), uploadedAt: "2025-06-14T11:20:00.000Z", revision: 1, note: "Original submission." },
            version,
          ]
        : [version],
  };
}

function makeTemplates(
  overrides: Record<string, Record<string, string>> = {},
  attachments: Record<string, RequirementAttachment[]> = {},
): TemplateEntry[] {
  return templateDefinitions.map((template) => ({
    templateId: template.id,
    enabled: true,
    values: overrides[template.id] ?? {},
    attachments: attachments[template.id] ?? [],
  }));
}

function makeEndorsement(required: boolean, endorsed = false, timestamp = "2025-06-14T11:30:00.000Z"): AdviserEndorsement {
  if (!required) return { required: false, state: "Not Required" };
  if (!endorsed) return { required: true, state: "Pending" };
  return {
    required: true,
    state: "Endorsed",
    actorId: "adviser",
    actorName: "Faculty Adviser",
    actorRole: "Faculty Adviser",
    timestamp,
    notes: "Reviewed and endorsed for SADU review.",
  };
}

export const seedApplications: EventApplication[] = [
  {
    id: "app-submitted",
    title: "Leadership Summit Vol.3",
    organization: "Junior Philippine Computer Society",
    eventType: "Seminar",
    venue: "FEU Alabang AVR",
    eventDate: "2025-07-03",
    expectedParticipants: 120,
    ownerId: "juan",
    adviserId: "adviser",
    status: "Submitted to SADU",
    riskLevel: "Medium",
    templates: makeTemplates({
      publicity: { channels: "Facebook page, org GC, campus bulletin", postingDate: "2025-07-22", materials: "Poster, caption, pubmat set" },
    }, {
      app: [attachment("app", "leadership-summit-app.pdf", 205_000, "2025-06-14T15:29:00.000Z")],
      apf: [attachment("apf", "leadership-summit-apf.pdf", 356_000, "2025-06-14T15:30:00.000Z")],
      verf: [attachment("verf", "leadership-summit-verf.jpg", 580_000, "2025-06-14T15:31:00.000Z")],
      publicity: [attachment("publicity", "leadership-summit-pubmat-draft.pdf", 690_000, "2025-06-14T15:40:00.000Z")],
    }),
    adviserEndorsement: makeEndorsement(true, true, "2025-06-14T15:42:00.000Z"),
    messages: [{ id: "m1", author: "Juan Reyes", role: "Student Officer", body: "Submitting for initial SADU review.", createdAt: "2025-06-14T15:45:00.000Z" }],
    timeline: [
      { id: "t1", status: "Draft", note: "Application created.", createdAt: "2025-06-12T09:00:00.000Z" },
      { id: "t-precheck", status: "AI Pre-check", note: "TAMS Guide pre-check completed.", createdAt: "2025-06-14T15:30:00.000Z" },
      { id: "t-endorse", status: "Pending Adviser Endorsement", note: "Faculty adviser endorsed the application for SADU review.", createdAt: "2025-06-14T15:42:00.000Z", actorId: "adviser", actorName: "Faculty Adviser", actorRole: "Faculty Adviser" },
      { id: "t2", status: "Submitted to SADU", note: "Submitted to SADU queue.", createdAt: "2025-06-14T15:45:00.000Z" },
    ],
  },
  {
    id: "app-approved",
    title: "FEU Hackathon 2025",
    organization: "Junior Philippine Computer Society",
    eventType: "Competition",
    venue: "FEU Alabang Innovation Lab",
    eventDate: "2025-07-26",
    expectedParticipants: 180,
    ownerId: "juan",
    adviserId: "adviser",
    status: "SADU Approved",
    riskLevel: "Low",
    templates: makeTemplates({
      publicity: { channels: "FB page and membership channels", postingDate: "2025-06-28", materials: "Event poster and reminders" },
    }, {
      app: [attachment("app", "hackathon-app.pdf", 205_000, "2025-06-10T12:15:00.000Z", "Juan Reyes", 1, "accepted")],
      apf: [attachment("apf", "hackathon-apf.pdf", 356_000, "2025-06-10T12:16:00.000Z", "Juan Reyes", 1, "accepted")],
      verf: [attachment("verf", "hackathon-verf.jpg", 580_000, "2025-06-10T12:17:00.000Z", "Juan Reyes", 1, "accepted")],
      publicity: [attachment("publicity", "hackathon-pubmat.pdf", 740_000, "2025-06-10T12:27:00.000Z", "Juan Reyes", 1, "accepted")],
    }),
    adviserEndorsement: makeEndorsement(true, true, "2025-06-10T12:40:00.000Z"),
    messages: [{ id: "m1", author: "SADU Associate", role: "SADU Associate", body: "Approved. Coordinate final logistics with facilities.", createdAt: "2025-06-19T11:30:00.000Z" }],
    timeline: [
      { id: "t-precheck", status: "AI Pre-check", note: "TAMS Guide pre-check completed.", createdAt: "2025-06-10T12:30:00.000Z" },
      { id: "t-endorse", status: "Pending Adviser Endorsement", note: "Faculty adviser endorsed the application for SADU review.", createdAt: "2025-06-10T12:40:00.000Z", actorId: "adviser", actorName: "Faculty Adviser", actorRole: "Faculty Adviser" },
      { id: "t1", status: "Submitted to SADU", note: "Application submitted.", createdAt: "2025-06-10T13:00:00.000Z" },
      { id: "t2", status: "SADU Approved", note: "Approved by SADU.", createdAt: "2025-06-19T11:30:00.000Z" },
    ],
  },
  {
    id: "app-draft",
    title: "Org Anniversary Night",
    organization: "Junior Philippine Computer Society",
    eventType: "Social Event",
    venue: "FEU Alabang Auditorium",
    eventDate: "2025-07-12",
    expectedParticipants: 150,
    ownerId: "juan",
    adviserId: "adviser",
    status: "Draft",
    riskLevel: "Low",
    templates: makeTemplates(),
    adviserEndorsement: makeEndorsement(true),
    messages: [],
    timeline: [{ id: "t1", status: "Draft", note: "Application created by Juan Reyes.", createdAt: "2025-06-05T15:45:00.000Z" }],
  },
  {
    id: "app-python",
    title: "Python Workshop Series",
    organization: "Junior Philippine Computer Society",
    eventType: "Workshop",
    venue: "Computer Lab 3",
    eventDate: "2025-07-30",
    expectedParticipants: 45,
    ownerId: "juan",
    adviserId: "adviser",
    status: "SADU Approved",
    riskLevel: "Low",
    templates: makeTemplates({
      publicity: { channels: "FB page, org GC, class announcements", postingDate: "2025-06-21", materials: "Poster and registration link" },
    }, {
      app: [attachment("app", "python-workshop-app.pdf", 205_000, "2025-05-30T12:15:00.000Z", "Juan Reyes", 1, "accepted")],
      apf: [attachment("apf", "python-workshop-apf.pdf", 356_000, "2025-05-30T12:16:00.000Z", "Juan Reyes", 1, "accepted")],
      verf: [attachment("verf", "python-workshop-verf.jpg", 580_000, "2025-05-30T12:17:00.000Z", "Juan Reyes", 1, "accepted")],
      publicity: [attachment("publicity", "python-workshop-pubmat.pdf", 612_000, "2025-05-30T12:26:00.000Z", "Juan Reyes", 1, "accepted")],
    }),
    adviserEndorsement: makeEndorsement(false),
    messages: [{ id: "m1", author: "SADU Associate", role: "SADU Associate", body: "Approved. Please coordinate lab access before the workshop dates.", createdAt: "2025-06-18T11:30:00.000Z" }],
    timeline: [
      { id: "t-precheck", status: "AI Pre-check", note: "TAMS Guide pre-check completed.", createdAt: "2025-05-30T12:30:00.000Z" },
      { id: "t1", status: "Submitted to SADU", note: "Application submitted.", createdAt: "2025-05-30T13:00:00.000Z" },
      { id: "t2", status: "SADU Approved", note: "Approved by SADU.", createdAt: "2025-06-18T11:30:00.000Z" },
    ],
  },
];

export function getTemplateCompletion(application: EventApplication, templateId: string) {
  const entry = application.templates.find((template) => template.templateId === templateId);
  const definition = templateDefinitions.find((template) => template.id === templateId);
  if (!entry || !definition || !entry.enabled) {
    return {
      complete: false,
      completed: 0,
      required: 0,
      missing: [] as string[],
      missingFields: [] as string[],
      missingAttachments: [] as string[],
      attachmentCount: 0,
      requiredAttachmentCount: 0,
    };
  }

  const requiredFields = definition.fields.filter((field) => field.required);
  const missingFields = requiredFields
    .filter((field) => !String(entry.values[field.id] ?? "").trim())
    .map((field) => field.label);
  const requiresAttachment = Boolean(definition.attachmentRequirement?.required);
  const visibleAttachments = entry.attachments?.filter((item) => item.reviewerVisible) ?? [];
  const missingAttachments = requiresAttachment && !visibleAttachments.length ? [definition.attachmentRequirement?.label ?? "Required attachment"] : [];
  const missing = [...missingFields, ...missingAttachments];
  const required = requiredFields.length + (requiresAttachment ? 1 : 0);
  const completed = required - missing.length;

  return {
    complete: missing.length === 0,
    completed,
    required,
    missing,
    missingFields,
    missingAttachments,
    attachmentCount: visibleAttachments.length,
    requiredAttachmentCount: requiresAttachment ? 1 : 0,
  };
}

export function getApplicationCompletion(application: EventApplication) {
  const enabledTemplates = application.templates.filter((template) => template.enabled);
  const summaries = enabledTemplates.map((template) => getTemplateCompletion(application, template.templateId));
  const complete = summaries.filter((summary) => summary.complete).length;
  return {
    complete,
    total: summaries.length,
    percent: summaries.length ? Math.round((complete / summaries.length) * 100) : 0,
    missing: summaries.flatMap((summary, index) => {
      if (!summary.missing.length) return [];
      const definition = templateDefinitions.find((template) => template.id === enabledTemplates[index].templateId);
      return [`${definition?.name}: ${summary.missing.join(", ")}`];
    }),
  };
}

export function isAiPrecheckComplete(application: EventApplication) {
  return application.timeline.some((entry) => entry.status === "AI Pre-check");
}

export function getAdviserEndorsement(application: EventApplication) {
  return application.adviserEndorsement ?? ({ required: false, state: "Not Required" } satisfies AdviserEndorsement);
}

export function getAdviserEndorsementReadiness(application: EventApplication) {
  const endorsement = getAdviserEndorsement(application);
  if (!endorsement?.required || endorsement.state === "Not Required") {
    return { required: false, complete: true, missing: [] as string[] };
  }

  return {
    required: true,
    complete: endorsement.state === "Endorsed" && Boolean(endorsement.actorId && endorsement.timestamp),
    missing:
      endorsement.state === "Endorsed" && endorsement.actorId && endorsement.timestamp
        ? []
        : ["Faculty adviser endorsement is required before SADU submission."],
  };
}

export function getSubmissionReadiness(application: EventApplication) {
  const completion = getApplicationCompletion(application);
  const templateMissing = completion.missing;
  const aiMissing = isAiPrecheckComplete(application) ? [] : ["Run the TAMS Guide AI completeness check."];
  const endorsement = getAdviserEndorsementReadiness(application);
  const verificationMissing = getVerificationMissing(application);
  const missing = [...templateMissing, ...aiMissing, ...verificationMissing, ...endorsement.missing];

  return {
    ready: missing.length === 0,
    missing,
    templateComplete: templateMissing.length === 0,
    aiPrecheckComplete: aiMissing.length === 0,
    verificationReady: verificationMissing.length === 0,
    adviserEndorsed: endorsement.complete,
    adviserRequired: endorsement.required,
  };
}

function shouldRequireVerification(application: EventApplication) {
  if (!["AI Pre-check", "Pending Adviser Endorsement", "Revision Requested"].includes(application.status)) return false;
  return application.templates.some((template) => (template.attachments ?? []).some((attachment) => attachment.reviewerVisible));
}

function getVerificationMissing(application: EventApplication) {
  if (!shouldRequireVerification(application)) return [] as string[];
  const summary = application.verificationSummary;
  if (!summary) return ["Run document verification for the current required files."];
  if (!summary.readyForSadu) {
    const findings = summary.blockingFindings.map((finding) => `${finding.label}: ${finding.recommendation}`);
    return findings.length ? findings : [`Document verification is ${summary.status.replace(/_/g, " ")}.`];
  }
  return [];
}

export function makeAiSummary(application: EventApplication) {
  return makePolicySummary(application);
}

export function makeChecklist(application: EventApplication) {
  return makePolicyChecklist(application);
}

export function makeRevisionDraft(application: EventApplication) {
  return makePolicyRevisionDraft(application);
}
