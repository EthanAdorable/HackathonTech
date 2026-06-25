import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getApplicationCompletion,
  makeAiSummary,
  makeChecklist,
  makeRevisionDraft,
  seedApplications,
  templateDefinitions,
  users,
} from "../lib/tams-data.ts";
import { addMessage, transitionApplication } from "../lib/workflow.ts";

const roles = new Set(users.map((user) => user.role));
assert.deepEqual([...roles].sort(), ["Admin", "Faculty Adviser", "SADU Associate", "Student Officer"].sort());
assert.equal(templateDefinitions.length, 7, "all required event templates should be present");

const byStatus = new Map(seedApplications.map((application) => [application.status, application]));
assert.ok(byStatus.get("Draft"), "seed data should include a draft application");
assert.ok(byStatus.get("Submitted to SADU"), "seed data should include a submitted application");
assert.ok(byStatus.get("Revision Requested"), "seed data should include a revision-requested application");
assert.ok(byStatus.get("SADU Approved"), "seed data should include an approved application");
assert.deepEqual(
  seedApplications.map((application) => application.title),
  ["Tech Career Fair 2025", "Leadership Summit Vol.3", "FEU Hackathon 2025", "Org Anniversary Night", "Python Workshop Series"],
  "dashboard seed rows should stay aligned with the reference screens",
);
assert.ok(
  seedApplications.every((application) => application.timeline.every((entry) => entry.createdAt.startsWith("2025-"))),
  "demo timeline dates should stay in the reference 2025 period",
);

const appComponent = readFileSync(new URL("../components/tams-hub-app.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const convexApplications = readFileSync(new URL("../convex/applications.ts", import.meta.url), "utf8");
const authRoute = readFileSync(new URL("../app/api/auth/[...nextauth]/route.ts", import.meta.url), "utf8");
const authConfig = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
assert.match(
  appComponent,
  /return \{ pending: 3, needsAction: 2, approved: 7, messages: 4 \};/,
  "student dashboard summary metrics should stay aligned with the reference screen",
);
assert.match(authRoute, /NextAuth\(authOptions\)/, "NextAuth route should use the shared auth options");
assert.match(authConfig, /CredentialsProvider/, "NextAuth credentials provider should be wired for TAMS Access");
assert.match(authConfig, /session\.user\.role = token\.role/, "NextAuth session should expose the demo user role");
assert.match(authConfig, /session\.user\.title = token\.title/, "NextAuth session should expose the demo user title");
assert.match(appComponent, /function toggleTemplateAvailability/, "Admin template availability toggles should be interactive");
assert.match(appComponent, /disabled=\{!canStartReview\}/, "SADU review action should be gated by submitted states");
assert.match(appComponent, /currentCompletion\.missing\.length/, "Revision resubmission should require completed fields");
assert.match(appComponent, /revisionApplication && onSelect\(revisionApplication\.id\)/, "Dashboard guide alert should open the revision application");
assert.match(appComponent, /<SendHorizonal size=\{16\} \/> Submit to SADU/, "Primary submission command should keep a consistent Lucide icon");
assert.match(appComponent, /Student Org Officer/, "UI role labels should match the reference screens");
assert.match(appComponent, /Student Council Officer/, "Dashboard welcome copy should match the reference student view");
assert.match(appComponent, /onlyActionItems/, "Dashboard filter button should have local filtering behavior");
assert.match(globalCss, /\.access-heading \.mascot-logo/, "Access page mascot should be sized like the reference login screens");
assert.match(appComponent, /aria-label="View notifications"/, "Topbar notification bell should be an accessible icon button");
assert.match(globalCss, /\.notification-dot/, "Topbar notification bell should include the reference unread dot");

const submitted = byStatus.get("Submitted to SADU");
assert.ok(getApplicationCompletion(submitted).percent >= 70, "submitted demo application should meet the prototype submission threshold");

let review = transitionApplication(submitted, "Under Review", "SADU opened the application for review.");
assert.equal(review.status, "Under Review");
assert.ok(review.timeline.some((entry) => entry.status === "Under Review"));

const revisionBody = makeRevisionDraft(review);
assert.match(revisionBody, /guidance only/i);
review = transitionApplication(addMessage(review, "SADU Associate", "SADU Associate", revisionBody), "Revision Requested", "SADU requested revisions.");
assert.equal(review.status, "Revision Requested");
assert.ok(review.messages.some((message) => message.body === revisionBody));

const revised = {
  ...review,
  templates: review.templates.map((template) =>
    template.templateId === "publicity"
      ? {
          ...template,
          values: {
            channels: "Facebook page, campus screens, and adviser-approved class announcements.",
            postingDate: "2025-07-22",
            materials: "Poster, caption, publication calendar, and approval screenshots.",
          },
        }
      : template,
  ),
};
assert.equal(getApplicationCompletion(revised).missing.length, 0, "revised demo application should clear required missing fields");

const resubmitted = transitionApplication(revised, "Resubmitted", "Student resubmitted after revision.");
const approved = transitionApplication(
  addMessage(resubmitted, "SADU Associate", "SADU Associate", "Approved. Final decision recorded by SADU reviewer."),
  "SADU Approved",
  "SADU approved the application.",
);
assert.equal(approved.status, "SADU Approved");
assert.ok(approved.timeline.some((entry) => entry.status === "Resubmitted"));
assert.ok(approved.timeline.some((entry) => entry.status === "SADU Approved"));

assert.ok(makeChecklist(approved).length >= 4, "TAMS Guide checklist should return useful guidance");
assert.match(makeAiSummary(approved), /SADU should verify final readiness/i);

for (const mutationName of ["requestRevision", "resubmit", "approve", "reject", "addEndorsement"]) {
  assert.match(convexApplications, new RegExp(`export const ${mutationName} = mutation`), `Convex mutation ${mutationName} should be available`);
}

console.log("Demo path check passed: reference seeds, roles, templates, revision loop, approval, Convex workflow mutations, and guide helpers are coherent.");
