import {
  getAdviserEndorsement,
  getAdviserEndorsementReadiness,
  getSubmissionReadiness,
  type EventApplication,
  type EventStatus,
  type Message,
  type Role,
  type TimelineEntry,
} from "./tams-data";

export type WorkflowActor = {
  id: string;
  name: string;
  role: Role;
};

export type WorkflowResult =
  | { ok: true; application: EventApplication }
  | { ok: false; application: EventApplication; errors: string[] };

function actorMetadata(actor?: WorkflowActor) {
  return actor
    ? {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
      }
    : {};
}

function validateTransition(application: EventApplication, status: EventStatus, actor?: WorkflowActor) {
  const errors: string[] = [];
  const from = application.status;

  if (status === "AI Pre-check" && !["Draft", "Template Completion", "AI Pre-check", "Revision Requested"].includes(from)) {
    errors.push(`AI pre-check is not allowed from ${from}.`);
  }

  if (status === "Pending Adviser Endorsement") {
    if (actor?.role !== "Student Officer") errors.push("Only a student officer can request adviser endorsement.");
    if (from !== "AI Pre-check") errors.push(`Adviser endorsement request is not allowed from ${from}.`);
    const endorsement = getAdviserEndorsement(application);
    const readiness = getSubmissionReadiness({ ...application, adviserEndorsement: { ...endorsement, state: "Endorsed" } });
    const missingBeforeEndorsement = readiness.missing.filter((item) => !item.includes("Faculty adviser endorsement"));
    if (missingBeforeEndorsement.length) errors.push(...missingBeforeEndorsement);
  }

  if (status === "Submitted to SADU") {
    const readiness = getSubmissionReadiness(application);
    if (!readiness.ready) errors.push(...readiness.missing);
    if (!["AI Pre-check", "Pending Adviser Endorsement", "Revision Requested"].includes(from)) {
      errors.push(`Submission is not allowed from ${from}.`);
    }
  }

  if (status === "Under Review" && !["Submitted to SADU", "Resubmitted"].includes(from)) {
    errors.push(`SADU review is not allowed from ${from}.`);
  }

  if (status === "Revision Requested" && from !== "Under Review") {
    errors.push(`Revision request is not allowed from ${from}.`);
  }

  if (status === "Resubmitted") {
    const readiness = getSubmissionReadiness(application);
    if (from !== "Revision Requested") errors.push(`Resubmission is not allowed from ${from}.`);
    if (!readiness.ready) errors.push(...readiness.missing);
  }

  if ((status === "SADU Approved" || status === "Rejected") && from !== "Under Review") {
    errors.push(`${status} is not allowed from ${from}.`);
  }

  if (status === "SADU Approved" && !getAdviserEndorsementReadiness(application).complete) {
    errors.push("SADU approval requires adviser endorsement.");
  }

  return errors;
}

export function transitionApplication(
  application: EventApplication,
  status: EventStatus,
  note: string,
  actor?: WorkflowActor,
): EventApplication {
  const result = tryTransitionApplication(application, status, note, actor);
  return result.application;
}

export function tryTransitionApplication(
  application: EventApplication,
  status: EventStatus,
  note: string,
  actor?: WorkflowActor,
): WorkflowResult {
  const errors = validateTransition(application, status, actor);
  if (errors.length) return { ok: false, application, errors };

  const timelineEntry: TimelineEntry = {
    id: `timeline-${Date.now()}`,
    status,
    note,
    createdAt: new Date().toISOString(),
    ...actorMetadata(actor),
  };

  return {
    ok: true,
    application: {
      ...application,
      status,
      timeline: [...application.timeline, timelineEntry],
    },
  };
}

export function addMessage(
  application: EventApplication,
  author: string,
  role: Role,
  body: string,
  actor?: WorkflowActor,
): EventApplication {
  const message: Message = {
    id: `message-${Date.now()}`,
    author,
    role,
    body,
    createdAt: new Date().toISOString(),
    ...actorMetadata(actor),
  };

  return {
    ...application,
    messages: [...application.messages, message],
  };
}

export function endorseApplication(
  application: EventApplication,
  actor: WorkflowActor,
  notes: string,
): WorkflowResult {
  if (actor.role !== "Faculty Adviser" || application.adviserId !== actor.id) {
    return { ok: false, application, errors: ["Only the assigned faculty adviser can endorse this application."] };
  }
  const endorsement = getAdviserEndorsement(application);
  if (!endorsement.required) {
    return { ok: false, application, errors: ["This application does not require adviser endorsement."] };
  }

  const endorsed: EventApplication = {
    ...application,
    adviserEndorsement: {
      required: true,
      state: "Endorsed",
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      timestamp: new Date().toISOString(),
      notes,
    },
  };

  const withMessage = addMessage(endorsed, actor.name, actor.role, notes, actor);
  return tryTransitionApplication(
    withMessage,
    "Submitted to SADU",
    "Faculty adviser endorsed the application for SADU review.",
    actor,
  );
}
