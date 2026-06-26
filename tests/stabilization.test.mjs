import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canAdministerDemoData,
  canAdministerTemplates,
  canCreateApplication,
  canEditApplication,
  canEndorseApplication,
  canReadApplication,
  canReviewAsSadu,
} from "../lib/access-policy.ts";
import { getSubmissionReadiness, seedApplications } from "../lib/tams-data.ts";
import { tryTransitionApplication } from "../lib/workflow.ts";

const sources = {
  app: readFileSync("components/tams-hub-app.tsx", "utf8"),
  auth: readFileSync("lib/auth.ts", "utf8"),
  workflowRoute: readFileSync("app/api/convex-workflow/route.ts", "utf8"),
  applicationsRoute: readFileSync("app/api/convex-applications/route.ts", "utf8"),
  usersRoute: readFileSync("app/api/convex-users/route.ts", "utf8"),
  guideRoute: readFileSync("app/api/tams-guide/route.ts", "utf8"),
  guideLogsRoute: readFileSync("app/api/guide-logs/route.ts", "utf8"),
  convexApplications: readFileSync("convex/applications.ts", "utf8"),
  convexGuide: readFileSync("convex/guide.ts", "utf8"),
  uploadAdapter: readFileSync("components/requirement-upload-adapter.ts", "utf8"),
};

const student = { id: "juan", name: "Juan Reyes", role: "Student Officer" };
const otherStudent = { id: "other", name: "Other Officer", role: "Student Officer" };
const sadu = { id: "sadu", name: "SADU Associate", role: "SADU Associate" };
const adviser = { id: "adviser", name: "Faculty Adviser", role: "Faculty Adviser" };
const admin = { id: "admin", name: "TAMS Admin", role: "Admin" };
const revisionApplication = seedApplications.find((application) => application.status === "Revision Requested");
const submittedApplication = seedApplications.find((application) => application.status === "Submitted to SADU");

test("access policy enforces owner, adviser, SADU, and admin boundaries", () => {
  assert.ok(canReadApplication(student, revisionApplication));
  assert.ok(!canReadApplication(otherStudent, revisionApplication));
  assert.ok(canReadApplication(sadu, revisionApplication));
  assert.ok(canReadApplication(admin, revisionApplication));
  assert.ok(canEditApplication(student, revisionApplication));
  assert.ok(!canEditApplication(sadu, revisionApplication));
  assert.ok(canCreateApplication(student));
  assert.ok(!canCreateApplication(admin));
  assert.ok(canReviewAsSadu(sadu));
  assert.ok(!canReviewAsSadu(adviser));
  assert.ok(canEndorseApplication(adviser, revisionApplication));
  assert.ok(canAdministerDemoData(admin));
  assert.ok(canAdministerTemplates(admin));
});

test("workflow rejects incomplete resubmission and unendorsed SADU submission", () => {
  const incomplete = tryTransitionApplication(revisionApplication, "Resubmitted", "Student resubmitted.", student);
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.errors.join(" "), /Budget Request Template|Publicity/);

  const draft = seedApplications.find((application) => application.status === "Draft");
  const submitted = tryTransitionApplication(draft, "Submitted to SADU", "Submit to SADU.", student);
  assert.equal(submitted.ok, false);
  assert.ok(submitted.errors.some((error) => error.includes("Faculty adviser endorsement")));
});

test("workflow completes SADU review and approval for an endorsed submission", () => {
  assert.equal(submittedApplication.adviserEndorsement.state, "Endorsed");
  const underReview = tryTransitionApplication(submittedApplication, "Under Review", "SADU opened review.", sadu);
  assert.equal(underReview.ok, true);

  const approved = tryTransitionApplication(underReview.application, "SADU Approved", "Approved by SADU.", sadu);
  assert.equal(approved.ok, true);
  assert.equal(approved.application.status, "SADU Approved");
  assert.ok(approved.application.timeline.some((entry) => entry.actorRole === "SADU Associate"));
});

test("auth config keeps demo credentials explicit and role-aware", () => {
  assert.match(sources.auth, /TAMS_DEMO_AUTH_ENABLED/);
  assert.match(sources.auth, /if \(!isDemoAuthEnabled\(\)\) return null/);
  assert.match(sources.auth, /api\.users\.list/);
  assert.match(sources.auth, /token\.role = user\.role/);
  assert.match(sources.auth, /session\.user\.role = token\.role/);
});

test("API routes derive access from authenticated server actors", () => {
  for (const source of [sources.applicationsRoute, sources.usersRoute, sources.guideLogsRoute, sources.guideRoute, sources.workflowRoute]) {
    assert.match(source, /getAccessActor\(\)/);
    assert.match(source, /Authentication required\./);
    assert.match(source, /\{ status: 401 \}/);
  }

  assert.match(sources.workflowRoute, /canEditApplication\(actor, application\)/);
  assert.match(sources.workflowRoute, /canReviewAsSadu\(actor\)/);
  assert.match(sources.workflowRoute, /canEndorseApplication\(actor, application\)/);
  assert.match(sources.workflowRoute, /canAdministerTemplates\(actor\)/);
  assert.match(sources.workflowRoute, /client\.query\(api\.applications\.get, \{ applicationId, actor \}\)/);
});

test("upload path validates metadata and supports replacement and removal", () => {
  assert.match(sources.workflowRoute, /"generateAttachmentUploadUrl"/);
  assert.match(sources.workflowRoute, /"recordAttachmentUpload"/);
  assert.match(sources.workflowRoute, /"removeAttachment"/);
  assert.match(sources.workflowRoute, /Only the application owner can upload requirement files/);
  assert.match(sources.convexApplications, /generateUploadUrl/);
  assert.match(sources.convexApplications, /sizeBytes > requirement\.maxSizeBytes/);
  assert.match(sources.convexApplications, /!requirement\.accepts\.includes\(args\.contentType\)/);
  assert.match(sources.convexApplications, /status: "replaced"/);
  assert.match(sources.convexApplications, /status: "removed"/);
  assert.match(sources.uploadAdapter, /versions: \[\.\.\.\(context\.previousAttachment\?\.versions \?\? \[\]\), version\]/);
});

test("TAMS Guide uses server-side application lookup and auditable access checks", () => {
  assert.match(sources.app, /applicationId: selectedApp\.id/);
  assert.doesNotMatch(sources.app, /application: selectedApp/);
  assert.match(sources.guideRoute, /Application access denied\./);
  assert.match(sources.guideRoute, /canReadApplication\(actor, application\)/);
  assert.match(sources.guideRoute, /client\.query\(api\.applications\.get, \{[\s\S]*actor/);
  assert.match(sources.guideRoute, /client\.mutation\(api\.guide\.record/);
  assert.match(sources.convexGuide, /assertCanReadApplication\(ctx, args\.actor, args\.applicationId\)/);
  assert.match(sources.guideLogsRoute, /api\.guide\.listForApplication/);
});

test("role-specific UI scopes creation, admin, review, and adviser affordances", () => {
  assert.match(sources.app, /showNewEvent=\{activeUser\.role === "Student Officer"\}/);
  assert.match(sources.app, /activeUser\.role === "Admin" && <ServiceReadinessPanel/);
  assert.match(sources.app, /activeUser\.role === "Admin" && <AdminOperationsPanel/);
  assert.match(sources.app, /activeUser\.role === "SADU Associate" && <ReviewerInsightsPanel/);
  assert.match(sources.app, /<WorkflowActions role=\{activeUser\.role\}/);
  assert.match(sources.app, /activeUser\.role === "Faculty Adviser"/);
  assert.match(sources.app, /visibleApplications = useMemo/);
});

test("submission readiness includes required attachments", () => {
  const readiness = getSubmissionReadiness(revisionApplication);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.missing.some((item) => item.includes("Budget worksheet or quotation file")));
  assert.ok(readiness.missing.some((item) => item.includes("Draft publication material")));
});
