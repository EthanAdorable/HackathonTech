import type { EventApplication, Role } from "./tams-data";

export type AccessActor = {
  id: string;
  name: string;
  role: Role;
  organization?: string;
  title?: string;
};

const FORM_REVIEW_ROLES = new Set<Role>(["SADU Associate", "Admin"]);

export function canSeeAllApplications(actor: AccessActor) {
  return actor.role === "Admin" || actor.role === "SADU Associate";
}

export function canReadApplication(actor: AccessActor, application: Pick<EventApplication, "ownerId" | "adviserId">) {
  if (canSeeAllApplications(actor)) return true;
  if (actor.role === "Student Officer") return application.ownerId === actor.id;
  if (actor.role === "Faculty Adviser") return application.adviserId === actor.id;
  return false;
}

export function canCreateApplication(actor: AccessActor) {
  return actor.role === "Student Officer";
}

export function canEditApplication(actor: AccessActor, application: Pick<EventApplication, "ownerId">) {
  return actor.role === "Student Officer" && application.ownerId === actor.id;
}

export function canReviewAsSadu(actor: AccessActor) {
  return FORM_REVIEW_ROLES.has(actor.role);
}

export function canHandleForms(actor: AccessActor) {
  return canReviewAsSadu(actor);
}

export function canEndorseApplication(actor: AccessActor, application: Pick<EventApplication, "adviserId">) {
  return actor.role === "Faculty Adviser" && application.adviserId === actor.id;
}

export function canAdministerDemoData(actor: AccessActor) {
  return actor.role === "Admin";
}

export function canAdministerTemplates(actor: AccessActor) {
  return actor.role === "Admin";
}
