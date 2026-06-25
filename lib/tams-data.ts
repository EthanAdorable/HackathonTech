export type Role = "Student Officer" | "SADU Associate" | "Faculty Adviser" | "Admin";

export type EventStatus =
  | "Draft"
  | "Template Completion"
  | "AI Pre-check"
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
  fields: TemplateField[];
};

export type TemplateEntry = {
  templateId: string;
  values: Record<string, string>;
  enabled: boolean;
};

export type Message = {
  id: string;
  author: string;
  role: Role;
  body: string;
  createdAt: string;
};

export type TimelineEntry = {
  id: string;
  status: EventStatus;
  note: string;
  createdAt: string;
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
  messages: Message[];
  timeline: TimelineEntry[];
};

export type DemoUser = {
  id: string;
  name: string;
  role: Role;
  organization?: string;
  title: string;
};

export const users: DemoUser[] = [
  {
    id: "juan",
    name: "Juan Reyes",
    role: "Student Officer",
    organization: "Junior Philippine Computer Society",
    title: "Secretary of JPCS",
  },
  {
    id: "sadu",
    name: "SADU Associate",
    role: "SADU Associate",
    title: "Student Activities Review Desk",
  },
  {
    id: "adviser",
    name: "Faculty Adviser",
    role: "Faculty Adviser",
    organization: "Junior Philippine Computer Society",
    title: "Organization Adviser",
  },
  {
    id: "admin",
    name: "Admin",
    role: "Admin",
    title: "Campus System Administrator",
  },
];

export const statuses: EventStatus[] = [
  "Draft",
  "Template Completion",
  "AI Pre-check",
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
    fields: [
      { id: "actualAttendance", label: "Actual attendance", type: "number", required: false },
      { id: "outcomes", label: "Outcomes", type: "textarea", required: false },
      { id: "documentationLink", label: "Documentation link", type: "text", required: false },
    ],
  },
];

const now = "2026-06-25T15:45:00.000Z";

function makeTemplates(overrides: Record<string, Record<string, string>> = {}): TemplateEntry[] {
  return templateDefinitions.map((template) => ({
    templateId: template.id,
    enabled: true,
    values: overrides[template.id] ?? {},
  }));
}

export const seedApplications: EventApplication[] = [
  {
    id: "app-draft",
    title: "Code Sprint Primer",
    organization: "Junior Philippine Computer Society",
    eventType: "Workshop",
    venue: "Computer Lab 3",
    eventDate: "2026-07-18",
    expectedParticipants: 45,
    ownerId: "juan",
    adviserId: "adviser",
    status: "Draft",
    riskLevel: "Low",
    templates: makeTemplates({
      proposal: { overview: "Introductory coding clinic for new JPCS members.", objectives: "Help participants prepare for hackathon work." },
    }),
    messages: [],
    timeline: [{ id: "t1", status: "Draft", note: "Application created by Juan Reyes.", createdAt: now }],
  },
  {
    id: "app-submitted",
    title: "Tamaraw Tech Forum",
    organization: "Junior Philippine Computer Society",
    eventType: "Seminar",
    venue: "FEU Alabang AVR",
    eventDate: "2026-08-05",
    expectedParticipants: 120,
    ownerId: "juan",
    adviserId: "adviser",
    status: "Submitted to SADU",
    riskLevel: "Medium",
    templates: makeTemplates({
      proposal: { overview: "A forum on responsible AI and campus innovation.", objectives: "Expose students to practical AI use cases.", targetAudience: "IT and CS students", successMeasure: "At least 100 attendees and post-event survey responses." },
      budget: { totalBudget: "15000", fundingSource: "Organization funds", expenseBreakdown: "Honorarium, certificates, snacks, publicity." },
      venue: { preferredVenue: "FEU Alabang AVR", setupNeeds: "Theater seating, registration desk", techNeeds: "Projector, two microphones" },
      program: { callTime: "8:00 AM", programFlow: "Registration, keynote, panel, open forum, closing.", officerAssignments: "Juan: documentation; Treasurer: registration; President: host." },
      publicity: { channels: "Facebook page, org GC, campus bulletin", postingDate: "2026-07-22", materials: "Poster, caption, pubmat set" },
    }),
    messages: [{ id: "m1", author: "Juan Reyes", role: "Student Officer", body: "Submitting for initial SADU review.", createdAt: now }],
    timeline: [
      { id: "t1", status: "Draft", note: "Application created.", createdAt: "2026-06-24T09:00:00.000Z" },
      { id: "t2", status: "Submitted to SADU", note: "Submitted to SADU queue.", createdAt: now },
    ],
  },
  {
    id: "app-revision",
    title: "Green IT Outreach",
    organization: "Junior Philippine Computer Society",
    eventType: "Outreach",
    venue: "Community Partner Hall",
    eventDate: "2026-08-21",
    expectedParticipants: 70,
    ownerId: "juan",
    adviserId: "adviser",
    status: "Revision Requested",
    riskLevel: "Medium",
    templates: makeTemplates({
      proposal: { overview: "Outreach introducing basic digital literacy and e-waste awareness.", objectives: "Support partner community through student-led learning.", targetAudience: "Senior high school learners", successMeasure: "Workshop completion and donated learning kits." },
      budget: { totalBudget: "9000", fundingSource: "Sponsor pledge", expenseBreakdown: "Kits, transport, snacks." },
      venue: { preferredVenue: "Community Partner Hall", setupNeeds: "Classroom seating" },
      program: { callTime: "7:00 AM", programFlow: "Travel, setup, session, activity, closing.", officerAssignments: "Project head: program; Secretary: attendance." },
    }),
    messages: [
      { id: "m1", author: "SADU Associate", role: "SADU Associate", body: "Please add publicity details and adviser endorsement comments before resubmission.", createdAt: "2026-06-25T10:20:00.000Z" },
    ],
    timeline: [
      { id: "t1", status: "Submitted to SADU", note: "Application submitted.", createdAt: "2026-06-24T12:00:00.000Z" },
      { id: "t2", status: "Revision Requested", note: "SADU requested missing publicity details.", createdAt: "2026-06-25T10:20:00.000Z" },
    ],
  },
  {
    id: "app-approved",
    title: "JPCS General Assembly",
    organization: "Junior Philippine Computer Society",
    eventType: "General Assembly",
    venue: "Multipurpose Hall",
    eventDate: "2026-07-04",
    expectedParticipants: 180,
    ownerId: "juan",
    adviserId: "adviser",
    status: "SADU Approved",
    riskLevel: "Low",
    templates: makeTemplates({
      proposal: { overview: "Semester assembly for members, committees, and project launches.", objectives: "Orient members and align committee work.", targetAudience: "JPCS members", successMeasure: "Attendance above 150 and committee signups." },
      budget: { totalBudget: "12000", fundingSource: "Organization funds", expenseBreakdown: "Snacks, printing, tokens." },
      venue: { preferredVenue: "Multipurpose Hall", setupNeeds: "Rows, stage table, registration area", techNeeds: "Sound system and projector" },
      program: { callTime: "12:30 PM", programFlow: "Registration, opening, reports, committee fair, closing.", officerAssignments: "All executive officers assigned." },
      publicity: { channels: "FB page and membership channels", postingDate: "2026-06-28", materials: "Event poster and reminders" },
    }),
    messages: [{ id: "m1", author: "SADU Associate", role: "SADU Associate", body: "Approved. Coordinate final logistics with facilities.", createdAt: "2026-06-25T11:30:00.000Z" }],
    timeline: [
      { id: "t1", status: "Submitted to SADU", note: "Application submitted.", createdAt: "2026-06-22T13:00:00.000Z" },
      { id: "t2", status: "SADU Approved", note: "Approved by SADU.", createdAt: "2026-06-25T11:30:00.000Z" },
    ],
  },
];

export function getTemplateCompletion(application: EventApplication, templateId: string) {
  const entry = application.templates.find((template) => template.templateId === templateId);
  const definition = templateDefinitions.find((template) => template.id === templateId);
  if (!entry || !definition || !entry.enabled) {
    return { complete: false, completed: 0, required: 0, missing: [] as string[] };
  }

  const requiredFields = definition.fields.filter((field) => field.required);
  const missing = requiredFields
    .filter((field) => !String(entry.values[field.id] ?? "").trim())
    .map((field) => field.label);

  return {
    complete: missing.length === 0,
    completed: requiredFields.length - missing.length,
    required: requiredFields.length,
    missing,
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

export function makeAiSummary(application: EventApplication) {
  const completion = getApplicationCompletion(application);
  return `${application.title} is a ${application.eventType.toLowerCase()} for ${application.expectedParticipants} participants at ${application.venue} on ${application.eventDate}. Template completion is ${completion.percent}%. Guidance only: SADU should verify final readiness and any campus-specific requirements.`;
}

export function makeChecklist(application: EventApplication) {
  const base = [
    `Confirm final venue availability for ${application.venue}.`,
    "Attach complete proposal, budget, venue, program, and publicity templates.",
    "Route adviser comments before final SADU decision.",
    "Keep all revision responses in the TAMS Hub message thread.",
  ];

  if (application.eventType.toLowerCase().includes("outreach")) {
    base.push("Prepare partner coordination notes and transport plan.");
  }

  if (application.expectedParticipants >= 100) {
    base.push("Flag crowd flow and registration staffing for human review.");
  }

  return base;
}

export function makeRevisionDraft(application: EventApplication) {
  const completion = getApplicationCompletion(application);
  const missing = completion.missing.length ? completion.missing.join("; ") : "no missing required fields detected";
  return `Please revise ${application.title} before resubmission. TAMS Guide found: ${missing}. This is guidance only; SADU will make the final decision after review.`;
}
