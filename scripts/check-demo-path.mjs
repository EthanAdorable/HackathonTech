import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const convexSetup = readFileSync(new URL("../scripts/setup-convex.mjs", import.meta.url), "utf8");
const railwaySetup = readFileSync(new URL("../scripts/setup-railway.mjs", import.meta.url), "utf8");
const serviceRunbook = readFileSync(new URL("../docs/service-setup.md", import.meta.url), "utf8");
const railwayConfig = readFileSync(new URL("../railway.json", import.meta.url), "utf8");
const startScript = readFileSync(new URL("../scripts/start.mjs", import.meta.url), "utf8");
assert.match(
  appComponent,
  /return \{ pending: 3, needsAction: 2, approved: 7, messages: 4 \};/,
  "student dashboard summary metrics should stay aligned with the reference screen",
);
assert.match(authRoute, /NextAuth\(authOptions\)/, "NextAuth route should use the shared auth options");
assert.match(authConfig, /CredentialsProvider/, "NextAuth credentials provider should be wired for TAMS Access");
assert.match(authConfig, /isDemoAuthEnabled/, "NextAuth demo credentials should be gated for public deploys");
assert.match(authConfig, /session\.user\.role = token\.role/, "NextAuth session should expose the demo user role");
assert.match(authConfig, /session\.user\.title = token\.title/, "NextAuth session should expose the demo user title");
assert.match(appComponent, /function toggleTemplateAvailability/, "Admin template availability toggles should be interactive");
assert.match(appComponent, /aria-pressed=\{available\}/, "Admin template toggles should expose pressed state");
assert.match(appComponent, /disabled=\{!canStartReview\}/, "SADU review action should be gated by submitted states");
assert.match(appComponent, /currentCompletion\.missing\.length/, "Revision resubmission should require completed fields");
assert.match(appComponent, /revisionApplication && onSelect\(revisionApplication\.id\)/, "Dashboard guide alert should open the revision application");
assert.match(appComponent, /<SendHorizonal size=\{16\} \/> Submit to SADU/, "Primary submission command should keep a consistent Lucide icon");
assert.match(appComponent, /Inconsistency Detected/, "File event guide should show the reference inconsistency alert");
assert.match(appComponent, /required document\(s\) missing/, "File event guide should show a separate missing-documents notice");
assert.match(appComponent, /className="warning-box" role="alert"/, "File event inconsistency warning should be announced as an alert");
assert.match(appComponent, /className="guide-says" role="status" aria-live="polite"/, "File event guide output should be announced politely");
assert.match(globalCss, /\.requirement-tile > svg/, "Upload requirement icons should use reference-style icon chips");
assert.match(appComponent, /Student Org Officer/, "UI role labels should match the reference screens");
assert.match(appComponent, /Student Council Officer/, "Dashboard welcome copy should match the reference student view");
assert.match(appComponent, /onlyActionItems/, "Dashboard filter button should have local filtering behavior");
assert.match(appComponent, /aria-pressed=\{onlyActionItems\}/, "Dashboard filter button should expose pressed state");
assert.match(appComponent, /aria-label=\{`Open \$\{app\.title\}`\}/, "Dashboard table rows should expose their open action");
assert.match(appComponent, /onKeyDown=\{\(event\) =>/, "Dashboard table rows should support keyboard selection");
assert.match(globalCss, /tbody tr:focus-visible/, "Dashboard table rows should show focus affordance");
assert.match(globalCss, /\.access-heading \.mascot-logo/, "Access page mascot should be sized like the reference login screens");
assert.match(nextConfig, /devIndicators:\s*false/, "Local demos should hide the Next.js dev indicator for reference-clean screenshots");
assert.match(appComponent, /\{"\\u2190"\} Back<\/button>/, "Verification back controls should use the reference left-arrow affordance");
assert.match(appComponent, /aria-pressed=\{user\.id === activeUserId\}/, "Access role preview chips should expose selected state");
assert.match(appComponent, /aria-label="View notifications"/, "Topbar notification bell should be an accessible icon button");
assert.match(appComponent, /aria-controls=\{notificationsOpen \? "notification-popover" : undefined\}/, "Notification trigger should reference the open popover");
assert.match(appComponent, /id="notification-popover" role="region" aria-label="Notifications"/, "Notification popover should expose a named region");
assert.match(globalCss, /\.notification-dot/, "Topbar notification bell should include the reference unread dot");
assert.match(appComponent, /topbar-identity/, "Topbar user identity should be grouped like the reference header");
assert.match(globalCss, /\.sidebar \.brand \.mascot-logo/, "Sidebar mascot should match the larger reference app chrome");
assert.match(appComponent, /"dashboard", label: "Dashboard", icon: <LayoutGrid size=\{18\} \/>/, "Sidebar dashboard icon should match the reference utility set");
assert.match(appComponent, /"applications", label: "My Applications", icon: <ClipboardList size=\{18\} \/>/, "Sidebar applications icon should match the reference utility set");
assert.match(appComponent, /"guide", label: "TAMS Guide", icon: <BriefcaseBusiness size=\{18\} \/>/, "Sidebar guide icon should match the reference utility set");
assert.match(appComponent, /aria-current=\{item\.id === activeSection \? "page" : undefined\}/, "Sidebar nav should expose the current section");
assert.match(appComponent, /"Student Officer": <UsersRound size=\{16\} \/>/, "Student organization role picker should use an organization-style icon");
assert.match(appComponent, /<Feature icon=\{<BriefcaseBusiness \/>\} title="TAMS Guide"/, "Guide overview feature icon should match the reference utility icon language");
assert.match(appComponent, /<Eye size=\{15\} \/> View All/, "View controls should use a consistent eye icon");
assert.match(appComponent, /partner-chip active/, "Suggested partner chips should include consistent icons and plus affordances");
assert.match(appComponent, /aria-pressed=\{selectedPartners\.includes\(partner\)\}/, "Suggested partner chips should behave as selectable controls");
assert.match(globalCss, /\.partner-chip\.active/, "Selected partner chips should have a visible active state");
assert.match(appComponent, /Final Approval/, "Application progress tracker should match the reference milestone labels");
assert.match(appComponent, /formatMilestoneDate/, "Application progress tracker should use compact reference-style dates");
assert.match(appComponent, /milestone\.done \? "done" : ""/, "Application progress tracker should allow active milestones to remain highlighted after completion");
assert.match(globalCss, /\.progress-step\.done\.active > span/, "Completed active progress milestones should keep the reference gold halo");
assert.match(appComponent, /Upload revised budget breakdown/, "Revision status should show reference-style required actions");
assert.match(appComponent, /Clarify expected number of participants/, "Revision status should call out participant count reconciliation");
assert.match(appComponent, /aria-pressed=\{app\.id === application\.id\}/, "Application cards should expose selected state");
assert.match(appComponent, /threadSearch/, "Messages search box should filter visible conversations");
assert.match(appComponent, /aria-label="Search messages"/, "Messages search input should have an accessible name");
assert.match(appComponent, /aria-label="Message"/, "Message composer input should have an accessible name");
assert.match(appComponent, /selectedThreadTitle/, "Messages thread list should select visible conversations");
assert.match(appComponent, /aria-pressed=\{thread\.title === selectedThread\.title\}/, "Message thread buttons should expose selected state");
assert.match(appComponent, /className="message-thread-header"/, "Messages chat panel should use a reference-style thread header band");
assert.match(globalCss, /\.message-thread-header/, "Messages thread header should have a scoped divider style");
assert.doesNotMatch(appComponent, /className="thread-summary"/, "Messages chat panel should not duplicate the selected thread preview");
assert.doesNotMatch(globalCss, /\.thread-summary/, "Messages stylesheet should not keep unused thread summary styles");
assert.match(appComponent, /aria-label="Send Message"/, "Icon-only message send button should have an accessible name");
assert.match(appComponent, /notificationsOpen/, "Topbar notification bell should open prototype alerts");
assert.match(globalCss, /\.notification-popover/, "Topbar notification alerts should be styled as a popover");
assert.match(appComponent, /TAMS Guide filing question/, "Guide question mode should expose an accessible prompt");
assert.match(appComponent, /aria-label="TAMS Guide mode"/, "Guide mode selector should expose an accessible name");
assert.match(appComponent, /guideModeLabels/, "Guide output should identify the active guidance mode");
assert.match(appComponent, /className="guide-output" role="status" aria-live="polite"/, "Guide workbench output should be announced politely");
assert.match(appComponent, /Human review required/, "Guide output should preserve the human-review boundary");
assert.match(readFileSync("scripts/check-services.mjs", "utf8"), /TAMS_DEPLOY_CHECK/, "Service checks should support deployment readiness validation");
assert.match(readFileSync("scripts/check-services.mjs", "utf8"), /TAMS_DEMO_AUTH_ENABLED/, "Service checks should warn when demo auth is exposed for deployment");
assert.match(serviceRunbook, /separate external projects/, "Service runbook should require separate Convex and Railway projects");
assert.match(serviceRunbook, /Do not reuse an unrelated Convex or Railway project/, "Service runbook should warn against reusing unrelated projects");
assert.match(convexSetup, /const project = .*"tams-hub-prototype"/, "Convex setup should default to the dedicated prototype project");
assert.match(railwaySetup, /const project = .*"tams-hub-prototype"/, "Railway setup should default to the dedicated prototype project");
assert.match(railwaySetup, /TAMS_DEMO_AUTH_ENABLED:\s*"false"/, "Railway setup should disable demo auth for public deployments");
assert.match(railwayConfig, /corepack pnpm start/, "Railway should start through the production start wrapper");
assert.match(startScript, /"--hostname", "0\.0\.0\.0"/, "Production start wrapper should bind to Railway's network interface");
assert.match(startScript, /process\.env\.PORT/, "Production start wrapper should honor Railway's injected port");
assert.match(packageJson, /"convex:codegen": "convex codegen --typecheck enable"/, "Convex codegen should be available as a checked script");
assert.match(convexSetup, /Generate Convex client types/, "Convex setup should generate official client types after deployment selection");
assert.match(convexSetup, /Convex setup dry-run complete/, "Convex setup dry-run should make clear that no cloud changes were made");
assert.ok(existsSync("convex/_generated/api.js"), "Convex generated runtime API should be committed");
assert.ok(existsSync("convex/_generated/dataModel.d.ts"), "Convex generated data model types should be committed");

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
