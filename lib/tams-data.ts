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
  id?: string;
  templateDocumentId?: string;
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

function makeTemplates(overrides: Record<string, Record<string, string>> = {}): TemplateEntry[] {
  return templateDefinitions.map((template) => ({
    templateId: template.id,
    enabled: true,
    values: overrides[template.id] ?? {},
  }));
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
    }),
    messages: [
      { id: "m1", author: "SADU Review", role: "SADU Associate", body: "The budget breakdown is incomplete. Please revise and resubmit. Also clarify the expected number of participants - the proposal says 120 but the registration form says 150.", createdAt: "2025-06-17T10:32:00.000Z" },
      { id: "m2", author: "FEU Alabang SC", role: "Student Officer", body: "Understood. We will revise the budget and update participant count. May we know the specific budget categories we should follow?", createdAt: "2025-06-17T10:45:00.000Z" },
    ],
    timeline: [
      { id: "t1", status: "Draft", note: "Application created.", createdAt: "2025-06-10T09:00:00.000Z" },
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
    }),
    messages: [{ id: "m1", author: "Juan Reyes", role: "Student Officer", body: "Submitting for initial SADU review.", createdAt: "2025-06-14T15:45:00.000Z" }],
    timeline: [
      { id: "t1", status: "Draft", note: "Application created.", createdAt: "2025-06-12T09:00:00.000Z" },
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
    }),
    messages: [{ id: "m1", author: "SADU Associate", role: "SADU Associate", body: "Approved. Coordinate final logistics with facilities.", createdAt: "2025-06-19T11:30:00.000Z" }],
    timeline: [
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
    }),
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
    }),
    messages: [{ id: "m1", author: "SADU Associate", role: "SADU Associate", body: "Approved. Please coordinate lab access before the workshop dates.", createdAt: "2025-06-18T11:30:00.000Z" }],
    timeline: [
      { id: "t1", status: "Submitted to SADU", note: "Application submitted.", createdAt: "2025-05-30T13:00:00.000Z" },
      { id: "t2", status: "SADU Approved", note: "Approved by SADU.", createdAt: "2025-06-18T11:30:00.000Z" },
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
