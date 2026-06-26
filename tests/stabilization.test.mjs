import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  compileVerificationSummary,
  extractionFromFields,
  runDeterministicVerification,
  validateExtractionJson,
} from "../lib/document-verification.ts";
import {
  activeExtractionSchemaVersion,
  documentRubricProfiles,
  getRubricProfile,
} from "../lib/rubrics.ts";
import {
  canAdministerDemoData,
  canAdministerTemplates,
  canCreateApplication,
  canEditApplication,
  canEndorseApplication,
  canReadApplication,
  canReviewAsSadu,
} from "../lib/access-policy.ts";
import { getSubmissionReadiness, seedApplications, users } from "../lib/tams-data.ts";
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
  convexSchema: readFileSync("convex/schema.ts", "utf8"),
  convexVerification: readFileSync("convex/verification.ts", "utf8"),
  convexGuide: readFileSync("convex/guide.ts", "utf8"),
  verificationRoute: readFileSync("app/api/document-verification/route.ts", "utf8"),
  uploadAdapter: readFileSync("components/requirement-upload-adapter.ts", "utf8"),
  middleware: readFileSync("middleware.ts", "utf8"),
};

const student = { id: "juan", name: "Juan Reyes", role: "Student Officer" };
const otherStudent = { id: "other", name: "Other Officer", role: "Student Officer" };
const sadu = { id: "sadu", name: "SADU Associate", role: "SADU Associate" };
const adviser = { id: "adviser", name: "Faculty Adviser", role: "Faculty Adviser" };
const admin = { id: "admin", name: "TAMS Admin", role: "Admin" };
const submittedApplication = seedApplications.find((application) => application.status === "Submitted to SADU");
assert.ok(submittedApplication);

function makeIncompleteRevisionFixture() {
  return {
    ...submittedApplication,
    id: "test-incomplete-revision",
    status: "Revision Requested",
    templates: submittedApplication.templates.map((template) =>
      template.templateId === "app" ? { ...template, attachments: [] } : template,
    ),
    messages: [
      ...submittedApplication.messages,
      { id: "test-revision-message", author: "SADU Associate", role: "SADU Associate", body: "Please upload the revised APP FORM before resubmission.", createdAt: "2025-06-17T10:32:00.000Z" },
    ],
    timeline: [
      ...submittedApplication.timeline,
      { id: "test-revision-timeline", status: "Revision Requested", note: "SADU requested revisions.", createdAt: "2025-06-17T10:32:00.000Z" },
    ],
  };
}

test("access policy enforces owner, adviser, SADU, and admin boundaries", () => {
  assert.deepEqual(users.map((user) => user.role).sort(), ["Admin", "Faculty Adviser", "SADU Associate", "Student Officer"]);
  assert.ok(canReadApplication(student, submittedApplication));
  assert.ok(!canReadApplication(otherStudent, submittedApplication));
  assert.ok(canReadApplication(adviser, submittedApplication));
  assert.ok(!canReadApplication({ ...adviser, id: "other-adviser" }, submittedApplication));
  assert.ok(canReadApplication(sadu, submittedApplication));
  assert.ok(canReadApplication(admin, submittedApplication));
  assert.ok(canEditApplication(student, submittedApplication));
  assert.ok(!canEditApplication(otherStudent, submittedApplication));
  assert.ok(!canEditApplication(adviser, submittedApplication));
  assert.ok(!canEditApplication(sadu, submittedApplication));
  assert.ok(!canEditApplication(admin, submittedApplication));
  assert.ok(canCreateApplication(student));
  assert.ok(!canCreateApplication(adviser));
  assert.ok(!canCreateApplication(sadu));
  assert.ok(!canCreateApplication(admin));
  assert.ok(canReviewAsSadu(sadu));
  assert.ok(canReviewAsSadu(admin));
  assert.ok(!canReviewAsSadu(student));
  assert.ok(!canReviewAsSadu(adviser));
  assert.ok(canEndorseApplication(adviser, submittedApplication));
  assert.ok(!canEndorseApplication({ ...adviser, id: "other-adviser" }, submittedApplication));
  assert.ok(!canEndorseApplication(sadu, submittedApplication));
  assert.ok(!canEndorseApplication(admin, submittedApplication));
  assert.ok(canAdministerDemoData(admin));
  assert.ok(canAdministerTemplates(admin));
  assert.ok(!canAdministerDemoData(student));
  assert.ok(!canAdministerDemoData(sadu));
  assert.ok(!canAdministerTemplates(student));
  assert.ok(!canAdministerTemplates(sadu));
  assert.ok(!canAdministerTemplates(adviser));
});

test("workflow rejects incomplete resubmission and unendorsed SADU submission", () => {
  const incomplete = tryTransitionApplication(makeIncompleteRevisionFixture(), "Resubmitted", "Student resubmitted.", student);
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.errors.join(" "), /APP FORM/);

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

test("admin and SADU are form reviewers, but only admin administers templates", () => {
  for (const reviewer of [sadu, admin]) {
    assert.equal(canReviewAsSadu(reviewer), true, `${reviewer.role} should be able to handle review decisions`);
  }

  for (const nonReviewer of [student, adviser]) {
    assert.equal(canReviewAsSadu(nonReviewer), false, `${nonReviewer.role} should not handle review decisions`);
  }

  assert.equal(canAdministerTemplates(admin), true);
  assert.equal(canAdministerTemplates(sadu), false);
  assert.equal(canAdministerTemplates(student), false);
  assert.equal(canAdministerTemplates(adviser), false);

  const adminReview = tryTransitionApplication(submittedApplication, "Under Review", "Admin opened form review.", admin);
  assert.equal(adminReview.ok, true);
  assert.equal(adminReview.application.timeline.at(-1).actorRole, "Admin");
  assert.equal(tryTransitionApplication(submittedApplication, "Under Review", "Student tried review.", student).ok, false);
  assert.equal(tryTransitionApplication(submittedApplication, "Under Review", "Adviser tried review.", adviser).ok, false);
});

test("auth config keeps demo credentials explicit and role-aware", () => {
  assert.match(sources.auth, /TAMS_DEMO_AUTH_ENABLED/);
  assert.match(sources.auth, /if \(!isDemoAuthEnabled\(\)\) return null/);
  assert.match(sources.auth, /api\.users\.list/);
  assert.match(sources.auth, /token\.role = user\.role/);
  assert.match(sources.auth, /session\.user\.role = token\.role/);
});

test("API routes derive access from authenticated server actors", () => {
  for (const source of [sources.applicationsRoute, sources.usersRoute, sources.guideLogsRoute, sources.guideRoute, sources.workflowRoute, sources.verificationRoute]) {
    assert.match(source, /getAccessActor\(\)/);
    assert.match(source, /Authentication required\./);
    assert.match(source, /\{ status: 401 \}/);
  }

  assert.match(sources.workflowRoute, /canEditApplication\(actor, application\)/);
  assert.match(sources.workflowRoute, /canReviewAsSadu\(actor\)/);
  assert.match(sources.workflowRoute, /canEndorseApplication\(actor, application\)/);
  assert.match(sources.workflowRoute, /canAdministerTemplates\(actor\)/);
  assert.match(sources.workflowRoute, /canAdministerTemplates\(actor\)[\s\S]*api\.applications\.updateTemplateAvailability/);
  assert.match(sources.workflowRoute, /canReviewAsSadu\(actor\)[\s\S]*api\.applications\.requestRevision/);
  assert.match(sources.workflowRoute, /canReviewAsSadu\(actor\)[\s\S]*api\.applications\.approve/);
  assert.match(sources.workflowRoute, /canReviewAsSadu\(actor\)[\s\S]*api\.applications\.reject/);
  assert.match(sources.workflowRoute, /client\.query\(api\.applications\.get, \{ applicationId, actor \}\)/);
  assert.match(sources.middleware, /\/api\/document-verification\/:path\*/, "document verification route should be protected by auth middleware");
});

test("upload path validates metadata and supports replacement and removal", () => {
  assert.match(sources.workflowRoute, /"generateAttachmentUploadUrl"/);
  assert.match(sources.workflowRoute, /"recordAttachmentUpload"/);
  assert.match(sources.workflowRoute, /"removeAttachment"/);
  assert.match(sources.workflowRoute, /sha256/);
  assert.match(sources.workflowRoute, /Only the application owner can upload requirement files/);
  assert.match(sources.convexApplications, /generateUploadUrl/);
  assert.match(sources.convexApplications, /uploadedDocuments/);
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
  assert.match(sources.app, /const canReviewForms = canReviewApplicationForms\(activeUser\.role\)/);
  assert.match(sources.app, /canReviewForms && <ReviewerInsightsPanel/);
  assert.match(sources.app, /Admin:\s*\{[\s\S]*actionFilterLabel: "Admin Review"/);
  assert.match(sources.app, /"SADU Associate":\s*\{[\s\S]*actionFilterLabel: "SADU Queue"/);
  assert.match(sources.app, /function canReviewApplicationForms\(role: Role\)[\s\S]*role === "SADU Associate" \|\| role === "Admin"/);
  assert.match(sources.app, /if \(canReviewApplicationForms\(role\)\)/);
  assert.match(sources.app, /<WorkflowActions role=\{activeUser\.role\}/);
  assert.match(sources.app, /activeUser\.role === "Faculty Adviser"/);
  assert.match(sources.app, /visibleApplications = useMemo/);
  assert.match(sources.app, /onVerifyDocuments=\{verifyDocuments\}/);
  assert.match(sources.app, /Verification Evidence/);
});

test("submission readiness includes required attachments", () => {
  const readiness = getSubmissionReadiness(makeIncompleteRevisionFixture());
  assert.equal(readiness.ready, false);
  assert.ok(!readiness.missing.some((item) => item.includes("Budget worksheet or quotation file")));
  assert.ok(readiness.missing.some((item) => item.includes("APP FORM")));
});

test("document verification rubrics cover every template and validate extraction JSON", () => {
  assert.equal(documentRubricProfiles.length, 3);
  for (const documentType of ["app", "apf", "verf"]) {
    assert.ok(getRubricProfile(documentType), `${documentType} should have a rubric profile`);
  }

  assert.equal(validateExtractionJson({}).ok, false);
  const valid = validateExtractionJson({
    documentType: "app",
    schemaVersion: activeExtractionSchemaVersion,
    completenessStatus: "filled",
    extractionMode: "text_pdf",
    documentData: {
      formCode: "FEUA-FO-FIN-ACC-005/012623/Rev1",
      programTitle: "Campus workshop",
    },
    normalizedFields: [{
      fieldId: "programTitle",
      label: "Program title",
      value: "Campus workshop",
      confidence: 0.94,
      evidence: ["Campus workshop"],
      sourceLocations: ["page 1"],
    }],
    missingFields: [],
    unknownFields: [],
    confidence: 0.94,
    evidence: ["Campus workshop"],
    sourceLocations: ["page 1"],
  });
  assert.equal(valid.ok, true);
});

test("verification aggregation blocks critical failures and allows warning-only summaries", () => {
  const profile = getRubricProfile("app");
  const failed = runDeterministicVerification({
    profile,
    mimeType: "application/pdf",
    extractionError: "CODEX_LB_API_KEY is required.",
  });
  const blocked = compileVerificationSummary({
    rubricVersionId: profile.rubricVersionId,
    documentCount: 1,
    fileSignature: "app:hash:app-apf-verf-rubric-v1:app-apf-verf-extraction-v1:app-apf-verf-prompt-v1",
    results: failed,
    runStatuses: ["failed_ai_timeout"],
  });
  assert.equal(blocked.readyForSadu, false);
  assert.equal(blocked.status, "failed_ai_timeout");
  assert.ok(blocked.criticalFailureCount >= 1);

  const passed = runDeterministicVerification({
    profile,
    mimeType: "application/pdf",
    extraction: extractionFromFields({
      documentType: "app",
      completenessStatus: "filled",
      confidence: 0.92,
      hasPage2: false,
      fields: Object.fromEntries(profile.requiredFieldIds.map((fieldId) => [
        fieldId,
        fieldId === "totalProposedBudget"
          ? 2900
          : fieldId.includes("Date") || fieldId.includes("Time")
            ? "June 17, 2026 9:00 AM"
            : fieldId === "budgetCategories" || fieldId === "objectives"
              ? ["present"]
              : "present",
      ])),
      evidence: ["present"],
      sourceLocations: ["page 1"],
    }),
  });
  const ready = compileVerificationSummary({
    rubricVersionId: profile.rubricVersionId,
    documentCount: 1,
    fileSignature: "app:hash:app-apf-verf-rubric-v1:app-apf-verf-extraction-v1:app-apf-verf-prompt-v1",
    results: passed,
  });
  assert.equal(ready.readyForSadu, true);
  assert.equal(ready.status, "needs_human_review");
});

test("document verification route is separate, Codex-LB only, and fail-closed", () => {
  assert.match(sources.verificationRoute, /api\.verification\.listActiveDocuments/);
  assert.match(sources.verificationRoute, /api\.verification\.getCachedExtraction/);
  assert.match(sources.verificationRoute, /normalizeCachedResults/);
  assert.match(sources.verificationRoute, /collectAttachmentUrls/);
  assert.match(sources.verificationRoute, /Promise\.all\(verificationDocuments\.map/);
  assert.match(sources.verificationRoute, /\["active", "uploaded"\]\.includes\(attachment\.status\)/);
  assert.match(sources.verificationRoute, /outcome\.extraction\?\.documentType \?\? outcome\.documentType/);
  assert.match(sources.verificationRoute, /CODEX_LB_API_KEY is required; verification fails closed/);
  assert.match(sources.verificationRoute, /validateExtractionJson/);
  assert.match(sources.verificationRoute, /response_format: \{ type: "json_object" \}/);
  assert.match(sources.verificationRoute, /fetchDocumentSource/);
  assert.match(sources.verificationRoute, /extractDocxText/);
  assert.match(sources.verificationRoute, /extractXlsxText/);
  assert.match(sources.verificationRoute, /extractPdfText/);
  assert.doesNotMatch(sources.verificationRoute, /mock/i);
  assert.match(sources.convexSchema, /uploadedDocuments/);
  assert.match(sources.convexSchema, /extractionRuns/);
  assert.match(sources.convexSchema, /verificationResults/);
  assert.match(sources.convexSchema, /compiledVerificationSummaries/);
  assert.match(sources.convexVerification, /saveVerificationOutcome/);
  assert.match(sources.convexVerification, /getCachedExtraction/);
  assert.match(sources.convexVerification, /by_cache_key/);
  assert.match(sources.convexVerification, /run\.extractionJson/);
  assert.match(sources.convexVerification, /startsWith\("failed_"\)/);
});
