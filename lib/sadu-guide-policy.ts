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
  requiredTemplates: ["app", "apf", "verf"],
  optionalTemplates: ["speaker", "publicity"],
  rules: [
    {
      id: "complete-core-templates",
      label: "Core filing templates",
      checklist: () => "Attach complete APP FORM, APF FORM, and VERF FORM requirements.",
    },
    {
      id: "optional-supporting-templates",
      label: "Optional supporting requirements",
      checklist: () => "Add Speaker guest request or Publicity Publication Post only when the event needs them.",
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

const templateLabelsById: Record<string, string> = {
  app: "APP FORM",
  apf: "APF FORM",
  verf: "VERF FORM",
  speaker: "Speaker guest request",
  publicity: "Publicity Publication Post",
};

function getPolicyCompletion(application: EventApplication) {
  const enabledTemplates = application.templates.filter((template) => template.enabled);
  const missing: string[] = [];
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
  return [...missing];
}

export function makePolicySummary(application: EventApplication) {
  const completion = getPolicyCompletion(application);
  const enabledTemplateNames = application.templates
    .filter((template) => template.enabled)
    .map((template) => templateLabelsById[template.templateId] ?? template.templateId);

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
