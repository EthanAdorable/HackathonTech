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
    id: "proposal",
    name: "Event Proposal Template",
    description: "Core event intent, objectives, audience, and operational details.",
    attachmentRequirement: { label: "Signed event proposal PDF", required: true, reviewerVisible: true },
    fields: [
      { id: "overview", label: "Event overview", type: "textarea", required: true },
      { id: "objectives", label: "Objectives", type: "textarea", required: true },
      { id: "targetAudience", label: "Target audience", type: "text", required: true },
      { id: "successMeasure", label: "Success measure", type: "textarea", required: true },
    ],
  },
  {
    id: "budget",
    name: "Budget Request Template",
    description: "Estimated cost, funding source, and procurement notes.",
    attachmentRequirement: { label: "Budget worksheet or quotation file", required: true, reviewerVisible: true },
    fields: [
      { id: "totalBudget", label: "Total budget", type: "number", required: true },
      { id: "fundingSource", label: "Funding source", type: "text", required: true },
      { id: "expenseBreakdown", label: "Expense breakdown", type: "textarea", required: true },
    ],
  },
  {
    id: "venue",
    name: "Venue/Facility Request Template",
    description: "Facility request, room setup, and support needs.",
    attachmentRequirement: { label: "Facility request form", required: true, reviewerVisible: true },
    fields: [
      { id: "preferredVenue", label: "Preferred venue", type: "text", required: true },
      { id: "setupNeeds", label: "Setup needs", type: "textarea", required: true },
      { id: "techNeeds", label: "Technical needs", type: "textarea", required: false },
    ],
  },
  {
    id: "program",
    name: "Program Flow Template",
    description: "Run of show, timings, and responsible officers.",
    attachmentRequirement: { label: "Program flow document", required: true, reviewerVisible: true },
    fields: [
      { id: "callTime", label: "Call time", type: "text", required: true },
      { id: "programFlow", label: "Program flow", type: "textarea", required: true },
      { id: "officerAssignments", label: "Officer assignments", type: "textarea", required: true },
    ],
  },
  {
    id: "speaker",
    name: "Speaker/Guest Request Template",
    description: "Guest profile, invitation status, and contact details.",
    attachmentRequirement: { label: "Guest invitation or confirmation", required: false, reviewerVisible: true },
    fields: [
      { id: "guestName", label: "Guest name", type: "text", required: false },
      { id: "guestAffiliation", label: "Guest affiliation", type: "text", required: false },
      { id: "invitationStatus", label: "Invitation status", type: "select", required: false, options: ["Not needed", "Drafted", "Sent", "Confirmed"] },
    ],
  },
  {
    id: "publicity",
    name: "Publicity/Publication Request Template",
    description: "Promotional channels, publication timing, and collateral notes.",
    attachmentRequirement: { label: "Draft publication material", required: true, reviewerVisible: true },
    fields: [
      { id: "channels", label: "Publication channels", type: "textarea", required: true },
      { id: "postingDate", label: "Target posting date", type: "date", required: true },
      { id: "materials", label: "Materials needed", type: "textarea", required: true },
    ],
  },
  {
    id: "postEvent",
    name: "Post-Event Report Template",
    description: "Completion report for attendance, outcomes, and documentation.",
    attachmentRequirement: { label: "Post-event documentation", required: false, reviewerVisible: false },
    fields: [
      { id: "actualAttendance", label: "Actual attendance", type: "number", required: false },
      { id: "outcomes", label: "Outcomes", type: "textarea", required: false },
      { id: "documentationLink", label: "Documentation link", type: "text", required: false },
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
    mimeType: fileName.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
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
    id: "app-revision",
    title: "Tech Career Fair 2025",
    organization: "Junior Philippine Computer Society",
    eventType: "Career Expo",
    venue: "FEU Alabang Auditorium",
    eventDate: "2025-07-15",
    expectedParticipants: 150,
    ownerId: "juan",
    adviserId: "adviser",
    status: "Revision Requested",
    riskLevel: "Medium",
    templates: makeTemplates({
      proposal: { overview: "Career expo connecting FEU Alabang students with industry partners.", objectives: "Expose students to internship and employment pathways.", targetAudience: "IT, CS, and engineering students", successMeasure: "At least 150 participants and employer feedback forms." },
      budget: { totalBudget: "25000", fundingSource: "Organization funds and partner sponsorships" },
      venue: { preferredVenue: "FEU Alabang Auditorium", setupNeeds: "Registration desk, booths, and stage seating" },
      program: { callTime: "8:00 AM", programFlow: "Registration, employer talks, booth rotation, networking, closing.", officerAssignments: "Secretary: attendance; Treasurer: partner kits." },
    }, {
      proposal: [attachment("proposal", "career-fair-proposal.pdf", 482_000, "2025-06-14T11:15:00.000Z", "Juan Reyes", 1, "uploaded")],
      venue: [attachment("venue", "auditorium-facility-request.pdf", 238_000, "2025-06-14T11:18:00.000Z", "Juan Reyes", 1, "uploaded")],
      program: [attachment("program", "career-fair-program-flow.pdf", 184_000, "2025-06-14T11:21:00.000Z", "Juan Reyes", 1, "uploaded")],
    }),
    adviserEndorsement: makeEndorsement(true, true, "2025-06-14T11:35:00.000Z"),
    messages: [
      { id: "m1", author: "SADU Review", role: "SADU Associate", body: "The budget breakdown is incomplete. Please revise and resubmit. Also clarify the expected number of participants - the proposal says 120 but the registration form says 150.", createdAt: "2025-06-17T10:32:00.000Z" },
      { id: "m2", author: "FEU Alabang SC", role: "Student Officer", body: "Understood. We will revise the budget and update participant count. May we know the specific budget categories we should follow?", createdAt: "2025-06-17T10:45:00.000Z" },
    ],
    timeline: [
      { id: "t1", status: "Draft", note: "Application created.", createdAt: "2025-06-10T09:00:00.000Z" },
      { id: "t-precheck", status: "AI Pre-check", note: "TAMS Guide pre-check completed.", createdAt: "2025-06-14T11:25:00.000Z" },
      { id: "t-endorse", status: "Pending Adviser Endorsement", note: "Faculty adviser endorsed the application for SADU review.", createdAt: "2025-06-14T11:35:00.000Z", actorId: "adviser", actorName: "Faculty Adviser", actorRole: "Faculty Adviser" },
      { id: "t2", status: "Submitted to SADU", note: "Application submitted.", createdAt: "2025-06-14T12:00:00.000Z" },
      { id: "t3", status: "Under Review", note: "SADU opened the application for review.", createdAt: "2025-06-15T09:00:00.000Z" },
      { id: "t4", status: "Revision Requested", note: "SADU requested budget and participant revisions.", createdAt: "2025-06-17T10:32:00.000Z" },
    ],
  },
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
      proposal: { overview: "Leadership development seminar for officers and committee heads.", objectives: "Build project management and student leadership skills.", targetAudience: "Student organization officers", successMeasure: "At least 100 attendees and post-event survey responses." },
      budget: { totalBudget: "15000", fundingSource: "Organization funds", expenseBreakdown: "Honorarium, certificates, snacks, publicity." },
      venue: { preferredVenue: "FEU Alabang AVR", setupNeeds: "Theater seating, registration desk", techNeeds: "Projector, two microphones" },
      program: { callTime: "8:00 AM", programFlow: "Registration, keynote, panel, open forum, closing.", officerAssignments: "Juan: documentation; Treasurer: registration; President: host." },
      publicity: { channels: "Facebook page, org GC, campus bulletin", postingDate: "2025-07-22", materials: "Poster, caption, pubmat set" },
    }, {
      proposal: [attachment("proposal", "leadership-summit-proposal.pdf", 512_000, "2025-06-14T15:32:00.000Z")],
      budget: [attachment("budget", "leadership-summit-budget.xlsx", 96_000, "2025-06-14T15:34:00.000Z")],
      venue: [attachment("venue", "avr-facility-request.pdf", 244_000, "2025-06-14T15:35:00.000Z")],
      program: [attachment("program", "leadership-summit-program.pdf", 176_000, "2025-06-14T15:37:00.000Z")],
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
      proposal: { overview: "Campus hackathon for student teams building prototype solutions.", objectives: "Promote innovation, collaboration, and applied software development.", targetAudience: "FEU Alabang students", successMeasure: "At least 20 teams submit demos." },
      budget: { totalBudget: "12000", fundingSource: "Organization funds", expenseBreakdown: "Snacks, printing, tokens." },
      venue: { preferredVenue: "FEU Alabang Innovation Lab", setupNeeds: "Team tables, judges table, registration area", techNeeds: "Projector, Wi-Fi, and extension cords" },
      program: { callTime: "8:00 AM", programFlow: "Registration, opening, build sprint, judging, awarding.", officerAssignments: "All executive officers assigned." },
      publicity: { channels: "FB page and membership channels", postingDate: "2025-06-28", materials: "Event poster and reminders" },
    }, {
      proposal: [attachment("proposal", "hackathon-proposal.pdf", 530_000, "2025-06-10T12:18:00.000Z", "Juan Reyes", 1, "accepted")],
      budget: [attachment("budget", "hackathon-budget.xlsx", 88_000, "2025-06-10T12:20:00.000Z", "Juan Reyes", 1, "accepted")],
      venue: [attachment("venue", "innovation-lab-request.pdf", 221_000, "2025-06-10T12:22:00.000Z", "Juan Reyes", 1, "accepted")],
      program: [attachment("program", "hackathon-program-flow.pdf", 194_000, "2025-06-10T12:24:00.000Z", "Juan Reyes", 1, "accepted")],
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
    templates: makeTemplates({
      proposal: { overview: "Anniversary gathering for organization members and alumni.", objectives: "Celebrate milestones and recognize active student leaders." },
    }, {
      proposal: [attachment("proposal", "anniversary-night-draft-proposal.pdf", 318_000, "2025-06-05T16:10:00.000Z")],
    }),
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
      proposal: { overview: "Introductory coding clinic for new JPCS members.", objectives: "Help participants prepare for hackathon work.", targetAudience: "New JPCS members", successMeasure: "Workshop completion and practice submissions." },
      budget: { totalBudget: "6000", fundingSource: "Organization funds", expenseBreakdown: "Lab materials, certificates, snacks." },
      venue: { preferredVenue: "Computer Lab 3", setupNeeds: "Workstations and projector", techNeeds: "Python environment installed" },
      program: { callTime: "1:00 PM", programFlow: "Setup, fundamentals, exercises, sharing, closing.", officerAssignments: "Tech committee leads hands-on stations." },
      publicity: { channels: "FB page, org GC, class announcements", postingDate: "2025-06-21", materials: "Poster and registration link" },
    }, {
      proposal: [attachment("proposal", "python-workshop-proposal.pdf", 420_000, "2025-05-30T12:18:00.000Z", "Juan Reyes", 1, "accepted")],
      budget: [attachment("budget", "python-workshop-budget.xlsx", 74_000, "2025-05-30T12:19:00.000Z", "Juan Reyes", 1, "accepted")],
      venue: [attachment("venue", "computer-lab-request.pdf", 202_000, "2025-05-30T12:22:00.000Z", "Juan Reyes", 1, "accepted")],
      program: [attachment("program", "python-workshop-program.pdf", 168_000, "2025-05-30T12:24:00.000Z", "Juan Reyes", 1, "accepted")],
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

export function getAdviserEndorsementReadiness(application: EventApplication) {
  const endorsement = application.adviserEndorsement;
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
