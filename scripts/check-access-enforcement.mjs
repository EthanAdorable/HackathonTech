import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  canAdministerDemoData,
  canEditApplication,
  canReadApplication,
  canReviewAsSadu,
} from "../lib/access-policy.ts";

const student = { id: "juan", name: "Juan Reyes", role: "Student Officer" };
const otherStudent = { id: "ana", name: "Ana Cruz", role: "Student Officer" };
const adviser = { id: "adviser", name: "Faculty Adviser", role: "Faculty Adviser" };
const sadu = { id: "sadu", name: "SADU Associate", role: "SADU Associate" };
const admin = { id: "admin", name: "Admin", role: "Admin" };
const application = { ownerId: "juan", adviserId: "adviser" };

assert.equal(canReadApplication(student, application), true, "student owner can read own application");
assert.equal(canReadApplication(otherStudent, application), false, "student cannot read all applications");
assert.equal(canReadApplication(adviser, application), true, "assigned adviser can read application");
assert.equal(canReadApplication({ ...adviser, id: "other-adviser" }, application), false, "other adviser cannot read application");
assert.equal(canReadApplication(sadu, application), true, "SADU can read review queue");
assert.equal(canEditApplication(student, application), true, "student owner can edit own application");
assert.equal(canEditApplication(otherStudent, application), false, "student cannot edit another user's application");
assert.equal(canReviewAsSadu(sadu), true, "SADU can approve/reject");
assert.equal(canReviewAsSadu(student), false, "student cannot approve/reject");
assert.equal(canReviewAsSadu(admin), false, "admin cannot spoof SADU approval");
assert.equal(canAdministerDemoData(admin), true, "admin can reset demo data");
assert.equal(canAdministerDemoData(sadu), false, "non-admin cannot reset demo data");

const workflowRoute = readFileSync(new URL("../app/api/convex-workflow/route.ts", import.meta.url), "utf8");
const applicationsRoute = readFileSync(new URL("../app/api/convex-applications/route.ts", import.meta.url), "utf8");
const usersRoute = readFileSync(new URL("../app/api/convex-users/route.ts", import.meta.url), "utf8");
const guideLogsRoute = readFileSync(new URL("../app/api/guide-logs/route.ts", import.meta.url), "utf8");
const tamsGuideRoute = readFileSync(new URL("../app/api/tams-guide/route.ts", import.meta.url), "utf8");
const convexApplications = readFileSync(new URL("../convex/applications.ts", import.meta.url), "utf8");
const convexGuide = readFileSync(new URL("../convex/guide.ts", import.meta.url), "utf8");
const convexSeed = readFileSync(new URL("../convex/seed.ts", import.meta.url), "utf8");
const convexUsers = readFileSync(new URL("../convex/users.ts", import.meta.url), "utf8");

for (const route of [workflowRoute, applicationsRoute, usersRoute, guideLogsRoute, tamsGuideRoute]) {
  assert.match(route, /getAccessActor\(\)/, "API routes must derive actor from server session");
  assert.match(route, /Authentication required\./, "API routes must reject missing session");
}

assert.doesNotMatch(workflowRoute, /author:\s*payload\.author|role:\s*payload\.role/, "workflow must not trust client author or role");
assert.match(workflowRoute, /api\.applications\.listWithDetails,\s*\{\s*actor\s*\}/, "application refresh must use actor-filtered query");
assert.match(workflowRoute, /api\.seed\.seedDemoData,\s*\{\s*actor\s*\}/, "demo reset must pass actor");
assert.match(workflowRoute, /canReviewAsSadu\(actor\)[\s\S]*api\.applications\.approve/, "approval must be SADU-gated");
assert.match(workflowRoute, /canReviewAsSadu\(actor\)[\s\S]*api\.applications\.reject/, "rejection must be SADU-gated");

assert.match(convexApplications, /const actor = v\.object/, "Convex application functions must require actor");
assert.doesNotMatch(convexApplications, /actor = v\.optional/, "Convex application actor cannot be optional");
assert.doesNotMatch(convexApplications, /author:\s*v\.optional|role:\s*v\.optional/, "Convex workflow must not accept spoofed author or role");
assert.match(convexApplications, /applicationsForActor\(ctx, args\.actor\)/, "Convex application lists must filter by actor");
assert.match(convexApplications, /assertCanEditApplication\(args\.actor, application\)/, "Convex edits must require owner");
assert.match(convexApplications, /assertCanReviewAsSadu\(args\.actor\)/, "Convex review actions must require SADU");
assert.match(convexApplications, /assertCanAdminister\(args\.actor\)/, "Convex template admin must require admin");

assert.match(convexGuide, /actor,\s*\n\s*applicationId/, "guide logs must require actor");
assert.match(convexGuide, /assertCanReadApplication\(ctx, args\.actor, args\.applicationId\)/, "guide logs must be application-scoped");
assert.match(convexSeed, /args:\s*\{\s*actor,\s*\}/, "seed reset must require actor");
assert.match(convexSeed, /args\.actor\.role !== "Admin"/, "seed reset must require admin role");
assert.match(convexUsers, /args:\s*\{\s*actor,\s*\}/, "users list must require actor");
assert.match(convexUsers, /args\.actor\.role !== "Admin"/, "non-admin users list must be narrowed");

console.log("Access enforcement check passed: API and Convex paths require session-derived actor checks.");
