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
assert.equal(templateDefinitions.length, 9, "all required event templates and APP/APF/VERF slots should be present");
for (const templateId of ["app", "apf", "verf"]) {
  assert.ok(templateDefinitions.some((template) => template.id === templateId), `${templateId.toUpperCase()} upload slot should be present`);
}
assert.ok(!templateDefinitions.some((template) => template.id === "budget"), "Budget Request should not be a standalone filing requirement");

const byStatus = new Map(seedApplications.map((application) => [application.status, application]));
assert.ok(byStatus.get("Draft"), "seed data should include a draft application");
assert.ok(byStatus.get("Submitted to SADU"), "seed data should include a submitted application");
assert.ok(byStatus.get("SADU Approved"), "seed data should include an approved application");
assert.ok(!seedApplications.some((application) => /Career Fair/i.test(application.title)), "removed career fair demo application should not be reseeded");
assert.deepEqual(
  seedApplications.map((application) => application.title),
  ["Leadership Summit Vol.3", "FEU Hackathon 2025", "Org Anniversary Night", "Python Workshop Series"],
  "dashboard seed rows should stay aligned with the reference screens",
);
assert.ok(
  seedApplications.every((application) => application.timeline.every((entry) => entry.createdAt.startsWith("2025-"))),
  "demo timeline dates should stay in the reference 2025 period",
);

const appComponent = readFileSync(new URL("../components/tams-hub-app.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const convexSchema = readFileSync(new URL("../convex/schema.ts", import.meta.url), "utf8");
const convexApplications = readFileSync(new URL("../convex/applications.ts", import.meta.url), "utf8");
const convexSeed = readFileSync(new URL("../convex/seed.ts", import.meta.url), "utf8");
const convexGuide = readFileSync(new URL("../convex/guide.ts", import.meta.url), "utf8");
const convexUsers = readFileSync(new URL("../convex/users.ts", import.meta.url), "utf8");
const authRoute = readFileSync(new URL("../app/api/auth/[...nextauth]/route.ts", import.meta.url), "utf8");
const authConfig = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
const tamsGuideRoute = readFileSync(new URL("../app/api/tams-guide/route.ts", import.meta.url), "utf8");
const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const convexApplicationsRoute = readFileSync(new URL("../app/api/convex-applications/route.ts", import.meta.url), "utf8");
const convexUsersRoute = readFileSync(new URL("../app/api/convex-users/route.ts", import.meta.url), "utf8");
const convexWorkflowRoute = readFileSync(new URL("../app/api/convex-workflow/route.ts", import.meta.url), "utf8");
const guideLogsRoute = readFileSync(new URL("../app/api/guide-logs/route.ts", import.meta.url), "utf8");
const convexSetup = readFileSync(new URL("../scripts/setup-convex.mjs", import.meta.url), "utf8");
const railwaySetup = readFileSync(new URL("../scripts/setup-railway.mjs", import.meta.url), "utf8");
const serviceRunbook = readFileSync(new URL("../docs/service-setup.md", import.meta.url), "utf8");
const readme = readFileSync("README.md", "utf8");
const railwayConfig = readFileSync(new URL("../railway.json", import.meta.url), "utf8");
const startScript = readFileSync(new URL("../scripts/start.mjs", import.meta.url), "utf8");
assert.match(
  appComponent,
  /\["Submitted to SADU", "Under Review", "Resubmitted"\]\.includes\(app\.status\)/,
  "student dashboard pending metric should derive from current application statuses",
);
assert.match(appComponent, /applications\.reduce\(\(sum, app\) => sum \+ app\.messages\.length, 0\)/, "dashboard message metric should derive from current message data");
assert.match(authRoute, /NextAuth\(authOptions\)/, "NextAuth route should use the shared auth options");
assert.match(authConfig, /CredentialsProvider/, "NextAuth credentials provider should be wired for TAMS Access");
assert.match(authConfig, /ConvexHttpClient/, "NextAuth credentials should be able to load role users from Convex");
assert.match(authConfig, /api\.users\.list/, "NextAuth credentials should query Convex users when configured");
assert.match(authConfig, /const authUsers = await loadAuthUsers\(\)/, "NextAuth credentials should use the Convex-aware auth user loader");
assert.match(authConfig, /isDemoAuthEnabled/, "NextAuth demo credentials should be gated for public deploys");
assert.match(authConfig, /session\.user\.role = token\.role/, "NextAuth session should expose the demo user role");
assert.match(authConfig, /session\.user\.title = token\.title/, "NextAuth session should expose the demo user title");
assert.match(appComponent, /function toggleTemplateAvailability/, "Admin template availability toggles should be interactive");
assert.match(appComponent, /aria-pressed=\{available\}/, "Admin template toggles should expose pressed state");
assert.match(appComponent, /disabled=\{!canStartReview\}/, "SADU review action should be gated by submitted states");
assert.match(appComponent, /currentCompletion\.missing\.length/, "Revision resubmission should require completed fields");
assert.match(appComponent, /selectedApp\.status === "Revision Requested"/, "Revision pre-check should preserve the revision-requested workflow state");
assert.match(appComponent, /Demo compliance check completed for revision response\./, "Revision pre-check should record a revision-specific stub check note");
assert.match(appComponent, /disabled=\{missingCount > 0\} onClick=\{onResubmit\}/, "File Event revision upload should use the guarded resubmission action");
assert.doesNotMatch(appComponent, /Revision Requested"[\s\S]{0,260}<SendHorizonal size=\{16\} \/> Submit to SADU/, "Revision filing should not expose the generic submit action");
assert.doesNotMatch(appComponent, /Revision Requested"\) \?\? applications\[0\]/, "Dashboard guide alert should not fall back to a non-revision application");
assert.match(appComponent, /\{revisionApplication && \(/, "Dashboard guide alert should only render when a revision application exists");
assert.match(appComponent, /onSelect\(revisionApplication\.id\)/, "Dashboard guide alert should open the revision application");
assert.match(appComponent, /const revisionAlertText = revisionApplication/, "Dashboard guide alert should derive text from the selected revision application");
assert.match(appComponent, /getApplicationCompletion\(revisionApplication\)/, "Revision alerts should use application completion data");
assert.doesNotMatch(appComponent, /needs revised budget and participant clarification\. Deadline in 6 days\./, "Dashboard guide alert should not use fixed revision copy");
assert.match(appComponent, /<SendHorizonal size=\{16\} \/> Submit to SADU/, "Primary submission command should keep a consistent Lucide icon");
assert.match(appComponent, /SADU Revision Requested/, "File event guide should show a clear revision alert");
assert.match(appComponent, /application\.status === "Revision Requested"/, "File event revision alert should only appear for applications with requested revisions");
assert.match(appComponent, /revisionGuideDetail\(applicationCompletion\.missing, application\.messages\)/, "File event revision warning should derive detail from template gaps and thread messages");
assert.doesNotMatch(appComponent, /Budget Estimate \(PHP\)/, "File event screen should not show a standalone Budget Request field");
assert.doesNotMatch(appComponent, /budgetValues/, "File event screen should not derive UI from a standalone budget template");
assert.match(appComponent, /value=\{proposalValues\.objectives \?\? ""\}/, "File event objectives summary should derive from the selected proposal template");
assert.doesNotMatch(appComponent, /SADU flagged the budget breakdown and participant count/, "File event revision warning should not use fixed budget and participant copy");
assert.doesNotMatch(JSON.stringify(seedApplications), /budget breakdown|requested budget|revise the budget/i, "Seed revision evidence should not refer to removed standalone budget requirements");
assert.doesNotMatch(appComponent, /value="25,000\.00"/, "File event budget summary should not use a fixed sample amount");
assert.match(appComponent, /required item\(s\) missing/, "File event guide should show a separate missing-requirements notice");
assert.match(appComponent, /onRequirementUpload/, "File event requirements should expose upload and replace controls");
assert.match(appComponent, /Requirement Files/, "SADU review should expose reviewer-visible requirement files");
assert.match(appComponent, /className="warning-box" role="alert"/, "File event revision warning should be announced as an alert");
assert.match(appComponent, /className="guide-says" role="status" aria-live="polite"/, "File event guide output should be announced politely");
assert.match(appComponent, /const missingCards = getApplicationCompletion\(application\)\.missing/, "Status required actions should derive from current template gaps");
assert.match(appComponent, /Respond to SADU revision notes/, "Revision required actions should fall back to thread response when fields are complete");
assert.doesNotMatch(appComponent, /Upload revised budget breakdown/, "Status required actions should not use fixed budget-only revision copy");
assert.doesNotMatch(appComponent, /Proposal says 120 but registration form says 150/, "Status required actions should not use fixed participant mismatch copy");
assert.match(globalCss, /\.requirement-tile > svg/, "Upload requirement icons should use reference-style icon chips");
assert.match(appComponent, /Student Org Officer/, "UI role labels should match the reference screens");
assert.match(appComponent, /Student Council Officer/, "Dashboard welcome copy should match the reference student view");
assert.match(appComponent, /formatDashboardDate\(applications\)/, "Dashboard date should derive from current application data");
assert.doesNotMatch(appComponent, /Thursday, June 19, 2025/, "Dashboard date should not be stale hardcoded copy");
assert.doesNotMatch(appComponent, /return \{ pending: 3, needsAction: 2, approved: 7, messages: 4 \}/, "Dashboard stats should not be hardcoded for student officers");
assert.match(appComponent, /const pending = role === "Student Officer"/, "Dashboard pending count should derive from visible student data");
assert.match(appComponent, /onlyActionItems/, "Dashboard filter button should have local filtering behavior");
assert.match(appComponent, /aria-pressed=\{onlyActionItems\}/, "Dashboard filter button should expose pressed state");
assert.match(appComponent, /disabled=\{!onlyActionItems\} onClick=\{\(\) => setOnlyActionItems\(false\)\}/, "Dashboard View All should clear the action filter instead of opening an arbitrary row");
assert.match(appComponent, /aria-label=\{`Open \$\{app\.title\}`\}/, "Dashboard table rows should expose their open action");
assert.match(appComponent, /onKeyDown=\{\(event\) =>/, "Dashboard table rows should support keyboard selection");
assert.match(appComponent, /requiredActionLabel\(app\)/, "Dashboard required action cells should use computed workflow labels");
assert.match(appComponent, /function requiredActionLabel\(application: EventApplication\)/, "Dashboard required actions should be centralized by application state");
assert.match(appComponent, /getApplicationCompletion\(application\)\.missing\[0\]/, "Revision action labels should derive from current template gaps");
assert.doesNotMatch(appComponent, /Revise budget/, "Dashboard required actions should not assume every revision is a budget issue");
assert.match(appComponent, /className="table-scroll"/, "Dashboard table should remain horizontally accessible on narrow screens");
assert.match(globalCss, /tbody tr:focus-visible/, "Dashboard table rows should show focus affordance");
assert.match(globalCss, /\.table-scroll\s*\{[\s\S]*overflow-x: auto/, "Dashboard table wrapper should allow horizontal scrolling");
assert.match(globalCss, /\.guide-alert\s*\{[\s\S]*grid-template-columns: 1fr/, "Guide alert should stack at the mobile breakpoint");
assert.match(globalCss, /\.access-heading \.mascot-logo/, "Access page mascot should be sized like the reference login screens");
assert.match(nextConfig, /devIndicators:\s*false/, "Local demos should hide the Next.js dev indicator for reference-clean screenshots");
assert.match(appComponent, /function enterWithFeuAccount/, "FEU account login should submit directly through credentials sign-in");
assert.match(appComponent, /onClick=\{\(\) => void enterWithFeuAccount\(\)\}/, "Primary access button should continue through FEU email/password login");
assert.doesNotMatch(appComponent, /OTP Verification/, "Access screen should not expose OTP verification while TOTP is disabled");
assert.doesNotMatch(appComponent, /setAccessStep/, "Access screen should not route FEU login through a verification step");
assert.match(appComponent, /aria-pressed=\{user\.id === activeUserId\}/, "Access role preview chips should expose selected state");
assert.match(appComponent, /aria-label="View notifications"/, "Topbar notification bell should be an accessible icon button");
assert.match(appComponent, /aria-controls=\{notificationsOpen \? "notification-popover" : undefined\}/, "Notification trigger should reference the open popover");
assert.match(appComponent, /id="notification-popover" role="region" aria-label="Notifications"/, "Notification popover should expose a named region");
assert.match(appComponent, /const notificationItems = \[/, "Topbar notifications should derive from current app and service state");
assert.match(appComponent, /const revisionNotification = revisionApplication/, "Topbar revision alerts should derive from the current revision application");
assert.match(appComponent, /serviceStatus && !serviceStatus\.railwayProjectIdConfigured/, "Topbar setup alerts should derive from service readiness state");
assert.doesNotMatch(appComponent, /needs revised budget details/, "Topbar notifications should not assume a fixed revision reason");
assert.match(appComponent, /showNewEvent=\{activeUser\.role === "Student Officer"\}/, "Topbar file-event CTA should be the single student officer create command");
assert.doesNotMatch(appComponent, /activeUser\.role === "Student Officer" && <button className="primary-button" onClick=\{onNewEvent\}/, "Dashboard welcome panel should not duplicate the topbar file-event CTA");
assert.match(globalCss, /\.notification-dot/, "Topbar notification bell should include the reference unread dot");
assert.match(appComponent, /topbar-identity/, "Topbar user identity should be grouped like the reference header");
assert.match(globalCss, /\.topbar-identity \.role-badge\s*\{[\s\S]*text-overflow: ellipsis/, "Topbar role badge should truncate inside compact headers");
assert.match(globalCss, /\.sidebar \.brand \.mascot-logo/, "Sidebar mascot should match the larger reference app chrome");
assert.match(globalCss, /\.nav-button\.active::before\s*\{[\s\S]*background: var\(--gold\)/, "Active sidebar navigation should use a small gold rail instead of a full gold fill");
assert.doesNotMatch(globalCss, /\.nav-button\.active\s*\{[\s\S]*background: linear-gradient\(135deg, #f0b20a, #db9800\)/, "Active sidebar navigation should not compete with gold alert and action states");
assert.match(appComponent, /"dashboard", label: "Dashboard", icon: <LayoutGrid size=\{18\} \/>/, "Sidebar dashboard icon should match the reference utility set");
assert.match(appComponent, /"applications", label: "My Applications", icon: <ClipboardList size=\{18\} \/>/, "Sidebar applications icon should match the reference utility set");
assert.match(appComponent, /"guide", label: "TAMS Guide", icon: <Sparkles size=\{18\} \/>/, "Sidebar guide icon should match the AI assistant icon language");
assert.match(appComponent, /aria-current=\{item\.id === activeSection \? "page" : undefined\}/, "Sidebar nav should expose the current section");
assert.match(appComponent, /"Student Officer": <UsersRound size=\{16\} \/>/, "Student organization role picker should use an organization-style icon");
assert.match(appComponent, /<Feature icon=\{<Sparkles \/>\} title="TAMS Guide"/, "Guide overview feature icon should match the AI assistant icon language");
assert.doesNotMatch(appComponent, /BriefcaseBusiness/, "Guide surfaces should not use a business briefcase icon");
assert.match(appComponent, /<Eye size=\{15\} \/> View All/, "View controls should use a consistent eye icon");
assert.match(globalCss, /\.nav-button span\s*\{[\s\S]*text-overflow: ellipsis/, "Mobile nav labels should truncate instead of overflowing");
assert.match(globalCss, /\.template-card summary > span:first-child\s*\{[\s\S]*min-width: 0/, "Template summary text should not push completion badges");
assert.match(appComponent, /partner-chip active/, "Suggested partner chips should include consistent icons and plus affordances");
assert.match(appComponent, /aria-pressed=\{selectedPartners\.includes\(partner\)\}/, "Suggested partner chips should behave as selectable controls");
assert.match(globalCss, /\.partner-chip\.active/, "Selected partner chips should have a visible active state");
assert.match(appComponent, /Final Approval/, "Application progress tracker should match the reference milestone labels");
assert.match(appComponent, /formatMilestoneDate/, "Application progress tracker should use compact reference-style dates");
assert.match(appComponent, /milestone\.done \? "done" : ""/, "Application progress tracker should allow active milestones to remain highlighted after completion");
assert.match(globalCss, /\.progress-step\.done\.active > span/, "Completed active progress milestones should keep the reference gold halo");
assert.match(appComponent, /application\.status === "Revision Requested" \? `Revise \$\{title\.replace\(" Template", ""\)\}`/, "Revision status should derive required action labels from template gaps");
assert.match(appComponent, /const missingCards = getApplicationCompletion\(application\)\.missing\.slice\(0, 3\)\.map/, "Revision status should use completion data for required actions");
assert.match(appComponent, /Application thread message/, "Application status communication panel should include an inline message composer");
assert.match(appComponent, /placeholder=\{"Type a message to SADU\\u2026"\}/, "Application status composer should match the reference thread prompt");
assert.match(appComponent, /aria-label="Send Application Thread Message"/, "Application status composer send control should be accessible");
assert.match(globalCss, /\.inline-composer/, "Application status composer should have scoped spacing");
assert.match(appComponent, /aria-pressed=\{app\.id === application\.id\}/, "Application cards should expose selected state");
assert.match(appComponent, /threadSearch/, "Messages search box should filter visible conversations");
assert.match(appComponent, /aria-label="Search messages"/, "Messages search input should have an accessible name");
assert.match(appComponent, /aria-label="Message"/, "Message composer input should have an accessible name");
assert.match(appComponent, /placeholder=\{"Search messages\\u2026"\}/, "Visible placeholders should use polished ellipsis glyphs");
assert.match(globalCss, /\.thread-meta strong\s*\{[\s\S]*text-overflow: ellipsis/, "Message thread titles should truncate in the compact sidebar");
assert.match(appComponent, /applications\.map\(\(item\) =>/, "Messages thread list should derive conversations from visible application data");
assert.match(appComponent, /const latestMessage = item\.messages\.at\(-1\)/, "Messages thread previews should use the latest persisted application message");
assert.match(appComponent, /selectedThreadId/, "Messages thread list should select conversations by application id");
assert.match(appComponent, /visibleThreads\.find\(\(thread\) => thread\.id === selectedThreadId\)/, "Messages selected thread should stay aligned with filtered conversations");
assert.doesNotMatch(appComponent, /const threads = \[\s*\{ title: "SADU Review"/, "Messages should not use hardcoded thread rows");
assert.match(appComponent, /empty-chat-state/, "Messages should show an empty chat state when search hides every thread");
assert.match(appComponent, /className="empty-chat-state" role="status" aria-live="polite"/, "Messages empty chat state should be announced politely");
assert.doesNotMatch(appComponent, /visibleThreads\[0\] \?\?[\s\S]*threads\[0\]/, "Messages search should not fall back to an invisible thread");
assert.match(appComponent, /aria-pressed=\{thread\.id === selectedThread\.id\}/, "Message thread buttons should expose selected state");
assert.match(appComponent, /className="message-thread-header"/, "Messages chat panel should use a reference-style thread header band");
assert.match(globalCss, /\.message-thread-header/, "Messages thread header should have a scoped divider style");
assert.doesNotMatch(appComponent, /className="thread-summary"/, "Messages chat panel should not duplicate the selected thread preview");
assert.doesNotMatch(globalCss, /\.thread-summary/, "Messages stylesheet should not keep unused thread summary styles");
assert.match(appComponent, /aria-label="Send Message"/, "Icon-only message send button should have an accessible name");
assert.match(appComponent, /activeRole:\s*Role/, "Message thread alignment should receive the active user role");
assert.match(appComponent, /const isOwnMessage = message\.role === activeRole/, "Message bubbles should align by sender role");
assert.match(appComponent, /isOwnMessage \? "chat-bubble own" : "chat-bubble"/, "Message bubbles should render the own-message treatment by sender role");
assert.doesNotMatch(appComponent, /index % 2 \? "chat-bubble own" : "chat-bubble"/, "Message bubbles should not align by alternating index");
assert.match(appComponent, /ownLabel="You" expanded/, "Dedicated messages screen should label the active user's bubble as You");
assert.match(appComponent, /isOwnMessage && ownLabel \? ownLabel : message\.author/, "Application status threads should preserve organization or reviewer author labels");
assert.match(appComponent, /notificationsOpen/, "Topbar notification bell should open prototype alerts");
assert.match(globalCss, /\.notification-popover/, "Topbar notification alerts should be styled as a popover");
assert.match(appComponent, /TAMS Guide filing question/, "Guide question mode should expose an accessible prompt");
assert.match(appComponent, /aria-label="TAMS Guide mode"/, "Guide mode selector should expose an accessible name");
assert.match(appComponent, /guideModeLabels/, "Guide output should identify the active guidance mode");
assert.match(appComponent, /className="guide-output" role="status" aria-live="polite"/, "Guide workbench output should be announced politely");
assert.doesNotMatch(globalCss, /var\(--green\)/, "Guide styles should use defined green tokens");
assert.match(appComponent, /Guidance only/, "Guide output should preserve the human-review boundary");
assert.match(convexSchema, /guideLogs: defineTable/, "Convex schema should include auditable TAMS Guide logs");
assert.match(convexGuide, /export const record = mutation/, "Convex guide function should record generated guidance");
assert.match(convexGuide, /export const listForApplication = query/, "Convex guide function should expose guidance logs by application");
assert.match(tamsGuideRoute, /recordGuideLog\(authorizedBody, actor, source, mockLines\)/, "Mock guide responses should be audit logged when Convex is configured");
assert.match(tamsGuideRoute, /recordGuideLog\(authorizedBody, actor, "codex-lb", lines\)/, "codex-lb guide responses should be audit logged when Convex is configured");
assert.match(tamsGuideRoute, /applicationId\.startsWith\("app-"\)/, "Guide logging should skip local prototype draft ids");
assert.match(guideLogsRoute, /api\.guide\.listForApplication/, "Guide logs route should read auditable guidance history from Convex");
assert.match(appComponent, /fetch\(`\/api\/guide-logs\?applicationId=\$\{encodeURIComponent\(applicationId\)\}`\)/, "Guide view should load guidance history for the selected application");
assert.match(appComponent, /aria-label="TAMS Guide audit history"/, "Guide view should expose the guidance audit history");
assert.match(globalCss, /\.guide-history-item strong\s*\{[\s\S]*text-overflow: ellipsis/, "Guide history entries should stay compact inside the workbench");
assert.match(convexApplicationsRoute, /ConvexHttpClient/, "Frontend hydration route should read from the configured Convex deployment");
assert.match(convexApplicationsRoute, /api\.applications\.listWithDetails/, "Frontend hydration route should load detailed Convex applications");
assert.match(appComponent, /fetch\("\/api\/convex-applications"\)/, "App should try to hydrate application data from Convex");
assert.match(appComponent, /data\.source === "convex" && data\.applications\.length/, "App should prefer populated Convex application data");
assert.match(appComponent, /window\.localStorage\.getItem\(storageKey\)/, "App should keep local storage fallback for prototype edits");
assert.match(appComponent, /tams-hub-prototype-state-v3/, "App should use a fresh storage key after filing requirement changes");
assert.match(appComponent, /legacyStorageKeys[\s\S]*window\.localStorage\.removeItem\(key\)/, "App should clear legacy browser state that may contain removed filing requirements");
assert.match(appComponent, /applicationSource === "local"/, "App should avoid writing Convex-hydrated data back into local storage");
assert.match(convexUsersRoute, /api\.users\.list/, "Frontend user route should read role users from Convex");
assert.match(appComponent, /const \[roleUsers, setRoleUsers\] = useState<DemoUser\[\]>\(users\)/, "App should keep local role users as a fallback");
assert.match(appComponent, /fetch\("\/api\/convex-users"\)/, "App should hydrate TAMS Access role users from Convex");
assert.match(appComponent, /<AccessScreen users=\{roleUsers\}/, "Access screen should receive Convex-hydrated role users");
assert.match(appComponent, /<AdminOperationsPanel users=\{roleUsers\}/, "Admin role list should receive Convex-hydrated role users");
assert.match(appComponent, /const loadConvexApplications = useCallback/, "App should share the Convex application loader across hydration and reset");
assert.match(appComponent, /if \(applicationSource === "convex"\)/, "Admin reset should preserve Convex-backed sessions when possible");
assert.match(appComponent, /setApplicationSource\("local"\)/, "Admin reset should explicitly switch to local mode only after falling back to seed data");
assert.match(convexApplications, /templates: templates\.map\(\(template: any\) => templateWithUiId\(template, requirementsByTemplate\.get\(template\._id\) \?\? \[\]\)\)/, "Convex detailed queries should expose template document ids for updates");
assert.match(convexApplications, /templateDocumentId: document\._id/, "Convex template rows should carry explicit document ids for updates");
assert.match(convexWorkflowRoute, /api\.applications\.create/, "Convex workflow route should sync new application creation");
assert.match(convexWorkflowRoute, /api\.applications\.updateTemplate/, "Convex workflow route should sync template field edits");
assert.match(convexWorkflowRoute, /api\.applications\.updateTemplateAvailability/, "Convex workflow route should sync admin template availability changes");
assert.match(convexWorkflowRoute, /api\.applications\.addMessage/, "Convex workflow route should sync message actions");
assert.match(convexWorkflowRoute, /api\.applications\.requestRevision/, "Convex workflow route should sync revision requests");
assert.match(convexWorkflowRoute, /api\.applications\.approve/, "Convex workflow route should sync SADU approvals");
assert.match(convexWorkflowRoute, /function assertStatus/, "Convex workflow route should enforce transition rules before remote mutations");
assert.match(convexWorkflowRoute, /Use the \$\{payload\.status \?\? "requested"\} workflow action/, "Convex workflow route should block direct terminal status updates");
assert.match(convexWorkflowRoute, /Unsupported or incomplete workflow action/, "Convex workflow route should reject incomplete direct workflow calls");
assert.match(convexWorkflowRoute, /\{ status: 409 \}/, "Convex workflow route should report rejected Convex workflow transitions");
assert.match(appComponent, /fetch\("\/api\/convex-workflow"/, "App should sync workflow actions through the Convex workflow route");
assert.match(appComponent, /function syncConvexCreate\(next: EventApplication\)/, "App should sync newly-created applications to Convex");
assert.match(appComponent, /function syncConvexTemplate\(templateId: string, values: Record<string, string>\)/, "App should sync template field changes to Convex");
assert.match(appComponent, /function syncConvexTemplateAvailability\(templateId: string, enabled: boolean\)/, "App should sync admin template availability changes to Convex");
assert.match(appComponent, /template\?\.templateDocumentId \?\? template\?\.id/, "App should use Convex template document ids when syncing field changes");
assert.match(appComponent, /if \(applicationSource !== "convex"\) return/, "App should keep workflow sync scoped to Convex-hydrated data");
assert.match(appComponent, /function isConvexApplicationId\(id: string\)/, "App should distinguish Convex-hydrated applications from local prototype drafts");
assert.match(appComponent, /if \(!isConvexApplicationId\(selectedApp\.id\)\) return/, "App should avoid syncing local prototype drafts to Convex workflow mutations");
const serviceCheckScript = readFileSync("scripts/check-services.mjs", "utf8");
const serviceStatusRoute = readFileSync("app/api/service-status/route.ts", "utf8");
assert.match(serviceCheckScript, /TAMS_DEPLOY_CHECK/, "Service checks should support deployment readiness validation");
assert.match(serviceCheckScript, /TAMS_DEMO_AUTH_ENABLED/, "Service checks should warn when demo auth is exposed for deployment");
assert.match(serviceCheckScript, /function envValue\(key\)/, "Service checks should read Railway-provided process env values");
assert.match(serviceCheckScript, /missing\.length \? \(deployCheck \? "fail" : "wait"\)/, "Service checks should fail missing required env values in deploy mode");
assert.match(serviceCheckScript, /function projectTargetSummary\(\)/, "Service checks should summarize dedicated Convex and Railway project targets");
assert.match(serviceCheckScript, /TAMS_RAILWAY_PROJECT_ID/, "Service checks should require an explicit Railway project ID for deploy readiness");
assert.match(serviceCheckScript, /label: "Dedicated project target"/, "Service checks should report dedicated project targeting status");
assert.match(serviceStatusRoute, /authReadyForDeploy/, "Service status API should expose deploy auth readiness");
assert.match(serviceStatusRoute, /authWarnings/, "Service status API should expose deploy auth warning labels");
assert.match(serviceStatusRoute, /isPrototypeSecret/, "Service status API should detect local prototype auth secrets");
assert.match(serviceStatusRoute, /isLoopbackUrl/, "Service status API should detect localhost auth callbacks");
assert.match(serviceStatusRoute, /convexProject/, "Service status API should expose the target Convex project");
assert.match(serviceStatusRoute, /convexHost/, "Service status API should expose the configured Convex host");
assert.match(serviceStatusRoute, /railwayProjectId: railwayProjectId \? "set" : "missing"/, "Service status API should expose redacted Railway project ID state");
assert.match(serviceStatusRoute, /railwayProjectIdConfigured/, "Service status API should expose explicit Railway project ID readiness");
assert.match(appComponent, /Target project: \$\{convexProject\}/, "Admin service cards should show the dedicated Convex target");
assert.match(appComponent, /Target project: \$\{railwayProject\}/, "Admin service cards should show the dedicated Railway target");
assert.match(appComponent, /Host: \{convexHost\}/, "Admin service cards should show the configured Convex host");
assert.match(appComponent, /Project ID: \{railwayProjectId\}/, "Admin service cards should show redacted Railway project ID state");
assert.match(appComponent, /Auth Safety/, "Admin service cards should show deploy auth safety");
assert.match(appComponent, /authWarnings\.length \? authWarnings\.join/, "Admin service cards should list deploy auth warning labels");
assert.match(globalCss, /\.service-detail\s*\{[\s\S]*text-overflow: ellipsis/, "Admin service readiness metadata should stay compact");
assert.match(globalCss, /\.service-grid\s*\{[\s\S]*repeat\(auto-fit, minmax\(220px, 1fr\)\)/, "Service readiness cards should wrap cleanly as checks grow");
assert.match(appComponent, /railwayReady && railwayProjectReady/, "Admin service cards should require both Railway runtime and explicit project ID readiness");
assert.match(serviceRunbook, /separate external projects/, "Service runbook should require separate Convex and Railway projects");
assert.match(serviceRunbook, /Do not reuse an unrelated Convex or Railway project/, "Service runbook should warn against reusing unrelated projects");
assert.match(serviceRunbook, /Team: `conneura`/, "Service runbook should record the selected Convex team");
assert.match(serviceRunbook, /Dev deployment: `dev:zealous-ocelot-537`/, "Service runbook should record the configured Convex dev deployment");
assert.match(serviceRunbook, /Convex functions have been generated, pushed, and seeded/, "Service runbook should record completed Convex provisioning");
assert.match(serviceRunbook, /setup:railway -- --workspace <workspace> --dry-run/, "Railway runbook should require explicit workspace selection in setup examples");
assert.match(readme, /Convex schema\/functions provisioned on a dedicated prototype project/, "README should describe current Convex provisioning state");
assert.match(readme, /conneura\/tams-hub-prototype/, "README should record the dedicated Convex project");
assert.match(readme, /zealous-ocelot-537\.convex\.cloud/, "README should record the configured Convex client URL");
assert.match(readme, /loads seeded applications from the dedicated Convex deployment/, "README should describe Convex-backed application reads");
assert.match(readme, /New application creation, template field edits, admin template availability, status transitions/, "README should describe Convex-backed create, edit, admin, and workflow actions");
assert.match(readme, /TAMS Guide audit logs sync through Convex-backed routes/, "README should describe Convex-backed guide audit logs");
assert.match(readme, /visible in the Guide workbench/, "README should describe visible TAMS Guide audit history");
assert.match(readme, /local fallback for prototype demos/, "README should describe the remaining local prototype fallback");
assert.match(readme, /dedicated Railway project has been identified/, "README should describe the identified Railway project target");
assert.match(readme, /CLI auth, service selection, domain, and deployment still require Railway login/, "README should describe current Railway setup blocker");
assert.match(readme, /setup:railway -- --workspace <workspace> --dry-run/, "README should show explicit Railway workspace selection for dry-runs");
assert.match(readme, /setup:railway -- --project-id <railway-project-id> --environment production --service <service-name> --dry-run/, "README should show explicit Railway project targeting for dry-runs");
assert.match(convexSetup, /const project = .*"tams-hub-prototype"/, "Convex setup should default to the dedicated prototype project");
assert.match(convexSetup, /Missing Convex \$\{label\} value/, "Convex setup should reject missing project, team, or deployment argument values");
assert.match(railwaySetup, /const project = .*"TAMS Hub"/, "Railway setup should default to the identified dedicated Railway project");
assert.match(railwaySetup, /Missing Railway \$\{label\} value/, "Railway setup should reject missing project or workspace argument values");
assert.match(railwaySetup, /function isHttpUrl/, "Railway setup should validate public callback URLs before setting NEXTAUTH_URL");
assert.match(railwaySetup, /absolute http\(s\) URL/, "Railway setup should reject missing or malformed app URLs");
assert.match(railwaySetup, /providedProjectId/, "Railway setup should accept an explicit dedicated project ID");
assert.match(railwaySetup, /const railwayContextArgs = \[/, "Railway setup should build explicit context args for project-scoped commands");
assert.match(railwaySetup, /"variable", "set", pair, \.\.\.railwayContextArgs/, "Railway variable setup should target the dedicated project explicitly");
assert.match(railwaySetup, /"domain", \.\.\.railwayContextArgs/, "Railway domain setup should target the dedicated project explicitly");
assert.match(railwaySetup, /"up", \.\.\.railwayContextArgs/, "Railway deployment should target the dedicated project explicitly");
assert.match(railwaySetup, /isPrototypeSecret/, "Railway setup should avoid copying local prototype auth secrets into deployment");
assert.match(railwaySetup, /TAMS_DEMO_AUTH_ENABLED:\s*"false"/, "Railway setup should disable demo auth for public deployments");
assert.match(railwayConfig, /corepack pnpm start/, "Railway should start through the production start wrapper");
assert.match(startScript, /"--hostname", "0\.0\.0\.0"/, "Production start wrapper should bind to Railway's network interface");
assert.match(startScript, /process\.env\.PORT/, "Production start wrapper should honor Railway's injected port");
assert.match(packageJson, /"convex:codegen": "convex codegen --typecheck enable"/, "Convex codegen should be available as a checked script");
assert.match(convexSetup, /Generate Convex client types/, "Convex setup should generate official client types after deployment selection");
assert.match(convexSetup, /Convex setup dry-run complete/, "Convex setup dry-run should make clear that no cloud changes were made");
assert.ok(existsSync("convex/_generated/api.js"), "Convex generated runtime API should be committed");
assert.ok(existsSync("convex/_generated/dataModel.d.ts"), "Convex generated data model types should be committed");
assert.match(convexApplications, /function withUiId/, "Convex detailed queries should normalize document IDs for the UI model");
assert.match(convexApplications, /return applications\.map\(applicationWithUiId\)/, "Convex list query should expose application ids and endorsement state for UI selection");
assert.match(convexApplications, /adviserEndorsement:\s*\{[\s\S]*required,[\s\S]*state:/, "Convex application reads should expose nested adviser endorsement state for the UI");
assert.match(convexApplications, /messages: messages\.map\(withUiId\)/, "Convex detailed queries should expose message ids for React keys");
assert.match(convexApplications, /timeline: timeline\.map\(withUiId\)/, "Convex detailed queries should expose timeline ids for workflow rendering");
assert.match(convexSeed, /adviserEndorsementRequired: application\.adviserEndorsement\.required/, "Convex seed should persist adviser endorsement state for fresh demo resets");
assert.match(convexApplications, /export const updateTemplateAvailability = mutation/, "Convex should expose an admin template availability mutation");
assert.match(convexUsers, /function accessIdForUser/, "Convex users query should preserve stable TAMS access ids");
assert.match(convexUsers, /userDocumentId: document\._id/, "Convex users query should also expose user document ids");

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

function demoAttachment(id, fileName) {
  return [{
    id,
    fileName,
    size: 192000,
    uploadedAt: "2025-06-18T09:00:00.000Z",
    uploadedBy: "Juan Reyes",
    revision: 2,
    note: "Replacement uploaded after SADU revision.",
    mimeType: "application/pdf",
    status: "uploaded",
    reviewerVisible: true,
    versions: [{
      id: `${id}-v2`,
      fileName,
      size: 192000,
      uploadedAt: "2025-06-18T09:00:00.000Z",
      uploadedBy: "Juan Reyes",
      revision: 2,
      note: "Replacement uploaded after SADU revision.",
    }],
  }];
}

const revised = {
  ...review,
  verificationSummary: {
    status: "ready_for_sadu",
    rubricVersionId: "app-apf-verf-rubric-v1",
    documentCount: 3,
    criticalFailureCount: 0,
    warningCount: 0,
    readyForSadu: true,
    currentFileSignature: "demo-revision-ready",
    blockingFindings: [],
    warnings: [],
    generatedAt: "2025-06-18T09:05:00.000Z",
  },
  templates: review.templates.map((template) =>
    template.templateId === "publicity"
      ? {
          ...template,
          values: {
            channels: "Facebook page, campus screens, and adviser-approved class announcements.",
            postingDate: "2025-07-22",
            materials: "Poster, caption, publication calendar, and approval screenshots.",
          },
          attachments: demoAttachment("publicity-revision", "revised-publicity-materials.pdf"),
        }
      : template,
  ),
};
assert.equal(getApplicationCompletion(revised).missing.length, 0, "revised demo application should clear required missing fields");

const resubmitted = transitionApplication(revised, "Resubmitted", "Student resubmitted after revision.");
const underReviewAgain = transitionApplication(
  resubmitted,
  "Under Review",
  "SADU reopened the resubmitted application for review.",
  { id: "sadu", name: "SADU Associate", role: "SADU Associate" },
);
const approved = transitionApplication(
  addMessage(underReviewAgain, "SADU Associate", "SADU Associate", "Approved. Final decision recorded by SADU reviewer."),
  "SADU Approved",
  "SADU approved the application.",
  { id: "sadu", name: "SADU Associate", role: "SADU Associate" },
);
assert.equal(approved.status, "SADU Approved");
assert.ok(approved.timeline.some((entry) => entry.status === "Resubmitted"));
assert.ok(approved.timeline.some((entry) => entry.status === "Under Review"));
assert.ok(approved.timeline.some((entry) => entry.status === "SADU Approved"));

assert.ok(makeChecklist(approved).length >= 4, "TAMS Guide checklist should return useful guidance");
assert.match(makeAiSummary(approved), /SADU should verify policy readiness and final approval/i);

for (const mutationName of ["requestRevision", "resubmit", "approve", "reject", "addEndorsement"]) {
  assert.match(convexApplications, new RegExp(`export const ${mutationName} = mutation`), `Convex mutation ${mutationName} should be available`);
}

console.log("Demo path check passed: reference seeds, roles, templates, revision loop, approval, Convex workflow mutations, and guide helpers are coherent.");
