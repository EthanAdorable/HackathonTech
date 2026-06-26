import type { EventApplication } from "./tams-data";

export type GuideMode = "checklist" | "missing" | "summary" | "revision" | "question";

type PolicyRule = {
  id: string;
  label: string;
  appliesWhen?: (application: EventApplication) => boolean;
  checklist: (application: EventApplication) => string | null;
};

export const saduGuidePolicy = {
  sourceLabel: "SADU guideline rules v1",
  humanReviewBoundary: "Guidance only. Final approval decisions remain with SADU and human reviewers.",
  requiredTemplates: ["proposal", "budget", "venue", "program", "publicity"],
  rules: [
    {
      id: "complete-core-templates",
      label: "Core filing templates",
      checklist: () => "Attach complete proposal, budget, venue, program, and publicity templates.",
    },
    {
      id: "confirm-venue",
      label: "Venue coordination",
      checklist: (application) => `Confirm final venue availability for ${application.venue}.`,
    },
    {
      id: "adviser-route",
      label: "Adviser routing",
      checklist: () => "Route adviser comments before final SADU decision.",
    },
    {
      id: "revision-thread",
      label: "Revision traceability",
      checklist: () => "Keep all revision responses in the TAMS Hub message thread.",
    },
    {
      id: "large-event-flow",
      label: "Large event operations",
      appliesWhen: (application) => application.expectedParticipants >= 100,
      checklist: () => "Flag crowd flow and registration staffing for human review.",
    },
    {
      id: "outreach-coordination",
      label: "Outreach coordination",
      appliesWhen: (application) => application.eventType.toLowerCase().includes("outreach"),
      checklist: () => "Prepare partner coordination notes and transport plan.",
    },
  ] satisfies PolicyRule[],
};

const requiredFieldLabelsByTemplate: Record<string, { templateName: string; fields: Record<string, string> }> = {
  proposal: {
    templateName: "Event Proposal Template",
    fields: {
      overview: "Event overview",
      objectives: "Objectives",
      targetAudience: "Target audience",
      successMeasure: "Success measure",
    },
  },
  budget: {
    templateName: "Budget Request Template",
    fields: {
      totalBudget: "Total budget",
      fundingSource: "Funding source",
      expenseBreakdown: "Expense breakdown",
    },
  },
  venue: {
    templateName: "Venue/Facility Request Template",
    fields: {
      preferredVenue: "Preferred venue",
      setupNeeds: "Setup needs",
    },
  },
  program: {
    templateName: "Program Flow Template",
    fields: {
      callTime: "Call time",
      programFlow: "Program flow",
      officerAssignments: "Officer assignments",
    },
  },
  publicity: {
    templateName: "Publicity/Publication Request Template",
    fields: {
      channels: "Publication channels",
      postingDate: "Target posting date",
      materials: "Materials needed",
    },
  },
};

function getPolicyCompletion(application: EventApplication) {
  const enabledTemplates = application.templates.filter((template) => template.enabled);
  const missing = enabledTemplates.flatMap((template) => {
    const definition = requiredFieldLabelsByTemplate[template.templateId];
    if (!definition) return [];
    const missingFields = Object.entries(definition.fields)
      .filter(([fieldId]) => !String(template.values[fieldId] ?? "").trim())
      .map(([, label]) => label);
    return missingFields.length ? [`${definition.templateName}: ${missingFields.join(", ")}`] : [];
  });
  const complete = enabledTemplates.length - missing.length;
  return {
    complete,
    total: enabledTemplates.length,
    percent: enabledTemplates.length ? Math.max(0, Math.round((complete / enabledTemplates.length) * 100)) : 0,
    missing,
  };
}

export function makePolicyChecklist(application: EventApplication) {
  return saduGuidePolicy.rules
    .filter((rule) => !rule.appliesWhen || rule.appliesWhen(application))
    .map((rule) => rule.checklist(application))
    .filter((line): line is string => Boolean(line));
}

export function findPolicyIssues(application: EventApplication) {
  const completion = getPolicyCompletion(application);
  const missing = completion.missing;
  const issues = [...missing];
  const proposal = application.templates.find((template) => template.templateId === "proposal")?.values ?? {};
  const budget = application.templates.find((template) => template.templateId === "budget")?.values ?? {};
  const venue = application.templates.find((template) => template.templateId === "venue")?.values ?? {};

  if (proposal.targetAudience && application.expectedParticipants >= 100 && !budget.expenseBreakdown) {
    issues.push("Budget Request Template: Expense breakdown should support the stated participant count.");
  }
  if (venue.preferredVenue && venue.preferredVenue !== application.venue) {
    issues.push(`Venue/Facility Request Template: Preferred venue (${venue.preferredVenue}) differs from event venue (${application.venue}).`);
  }

  return issues;
}

export function makePolicySummary(application: EventApplication) {
  const completion = getPolicyCompletion(application);
  const enabledTemplateNames = application.templates
    .filter((template) => template.enabled)
    .map((template) => requiredFieldLabelsByTemplate[template.templateId]?.templateName ?? template.templateId);

  return `${application.title} is a ${application.eventType.toLowerCase()} for ${application.expectedParticipants} participants at ${application.venue} on ${application.eventDate}. Template completion is ${completion.percent}% across ${enabledTemplateNames.length} enabled templates. SADU should verify policy readiness and final approval.`;
}

export function makePolicyRevisionDraft(application: EventApplication) {
  const issues = findPolicyIssues(application);
  const issueText = issues.length ? issues.join("; ") : "no missing or inconsistent details detected";
  return `Please revise ${application.title} before resubmission. TAMS Guide checked ${saduGuidePolicy.sourceLabel} and found: ${issueText}. ${saduGuidePolicy.humanReviewBoundary}`;
}

export function makePolicyClarificationDraft(application: EventApplication, question?: string) {
  const issues = findPolicyIssues(application);
  const focus = issues.length ? ` Current filing focus: ${issues.slice(0, 2).join("; ")}.` : "";
  return [
    `Question: ${question ?? "What should be completed before SADU review?"}`,
    `Use ${saduGuidePolicy.sourceLabel}: complete required templates, resolve inconsistent details, keep adviser and SADU comments in the message thread, and wait for SADU's human decision.${focus}`,
    saduGuidePolicy.humanReviewBoundary,
  ];
}
