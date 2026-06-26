import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const authConfig = readFileSync("lib/auth.ts", "utf8");
const appComponent = readFileSync("components/tams-hub-app.tsx", "utf8");
const serviceStatusRoute = readFileSync("app/api/service-status/route.ts", "utf8");
const middleware = readFileSync("middleware.ts", "utf8");
const accessPolicy = readFileSync("lib/access-policy.ts", "utf8");
const convexApplications = readFileSync("convex/applications.ts", "utf8");
const convexUsers = readFileSync("convex/users.ts", "utf8");
const convexGuide = readFileSync("convex/guide.ts", "utf8");
const convexSeed = readFileSync("convex/seed.ts", "utf8");
const workflowRoute = readFileSync("app/api/convex-workflow/route.ts", "utf8");
const applicationsRoute = readFileSync("app/api/convex-applications/route.ts", "utf8");
const usersRoute = readFileSync("app/api/convex-users/route.ts", "utf8");
const guideLogsRoute = readFileSync("app/api/guide-logs/route.ts", "utf8");
const guideRoute = readFileSync("app/api/tams-guide/route.ts", "utf8");
const convexSchema = readFileSync("convex/schema.ts", "utf8");
const saduGuidePolicy = readFileSync("lib/sadu-guide-policy.ts", "utf8");

assert.match(
  authConfig,
  /return process\.env\.TAMS_DEMO_AUTH_ENABLED === "true"/,
  "Demo credentials auth must require an explicit TAMS_DEMO_AUTH_ENABLED=true flag.",
);
assert.doesNotMatch(
  authConfig,
  /NODE_ENV !== "production"/,
  "Demo credentials auth must not silently turn on in local development.",
);

assert.match(appComponent, /useSession\(\)/, "The app shell should derive the active TAMS Access user from NextAuth session state.");
assert.match(appComponent, /signIn\("credentials"/, "Demo role selection should create a real NextAuth session.");
assert.match(appComponent, /signOut\(\)/, "Signing out should clear the NextAuth session.");
assert.doesNotMatch(appComponent, /const \[entered, setEntered\]/, "The app must not use local entered state as the access gate.");
assert.match(appComponent, /demoAuthEnabled \? \(/, "Demo role controls should render only when the server reports demo auth enabled.");

assert.match(serviceStatusRoute, /demoAuthEnabled/, "Service status should expose whether demo auth is explicitly enabled.");

assert.match(accessPolicy, /application\.ownerId === actor\.id/, "Student officers should only read their own applications.");
assert.match(accessPolicy, /application\.adviserId === actor\.id/, "Faculty advisers should only read assigned applications.");
assert.match(applicationsRoute, /getAccessActor\(\)/, "Application reads must derive identity from the server session.");
assert.match(applicationsRoute, /listWithDetails, \{ actor \}/, "Application reads must pass the verified actor to Convex.");
assert.match(convexApplications, /const applications = await applicationsForActor\(ctx, args\.actor\)/, "Convex application lists must be actor-scoped.");
assert.doesNotMatch(convexApplications, /role: v\.optional\(v\.string\(\)\),\s*userId: v\.optional/, "Convex application reads must not accept caller-supplied role/user filters.");

assert.doesNotMatch(workflowRoute, /author\?: string|role\?: string/, "Workflow requests must not accept spoofable author or role fields.");
assert.doesNotMatch(workflowRoute, /ownerId: payload\.ownerId/, "Application creation must not trust caller-supplied ownerId.");
assert.match(workflowRoute, /ownerId: actor\.id/, "Application creation should bind ownership to the session actor.");
assert.match(convexApplications, /await addWorkflowMessage\(ctx, args\.applicationId, args\.actor\.name, args\.actor\.role, args\.body, args\.actor\)/, "Messages should use actor-derived author, role, and audit metadata.");

for (const mutationName of ["requestRevision", "approve", "reject"]) {
  assert.match(
    convexApplications,
    new RegExp(`export const ${mutationName} = mutation\\([\\s\\S]*?assertCanReviewAsSadu\\(args\\.actor\\)`),
    `${mutationName} must require a SADU actor.`,
  );
}

assert.match(workflowRoute, /canAdministerDemoData\(actor\)/, "Reset demo data route must require an admin actor.");
assert.match(convexSeed, /args\.actor\.role !== "Admin"/, "Seed reset mutation must reject non-admin actors.");
assert.match(convexApplications, /assertCanEditApplication\(args\.actor, application\)/, "Application edits must require the owning student officer.");
assert.match(workflowRoute, /Only the application owner can edit event details/, "Workflow detail edits must reject non-owners.");

assert.match(usersRoute, /api\.users\.list, \{ actor \}/, "User API route must pass the verified actor.");
assert.match(convexUsers, /args\.actor\.role !== "Admin"[\s\S]*filter\(\(user\) => user\.id === args\.actor\.id\)/, "Convex user list must scope non-admin reads to the current user.");
assert.match(guideLogsRoute, /api\.guide\.listForApplication[\s\S]*actor/, "Guide log reads must pass the verified actor.");
assert.match(guideRoute, /withAuthorizedApplication\(body, actor\)/, "TAMS Guide must authorize the selected application before guidance.");
const guideRequestBlock = guideRoute.match(/type GuideRequest = \{[\s\S]*?\};/)?.[0] ?? "";
assert.match(guideRequestBlock, /applicationId: string;/, "TAMS Guide requests must identify applications by id only.");
assert.doesNotMatch(guideRequestBlock, /application: EventApplication/, "TAMS Guide route must not trust client-supplied application objects.");
assert.match(guideRoute, /seedApplications\.find/, "Local demo guide data must be fetched server-side from canonical seed data.");
assert.match(guideRoute, /client\.query\(api\.applications\.get,[\s\S]*actor/, "Convex guide data must be fetched through actor-scoped application reads.");
assert.match(guideRoute, /OPENAI_TIMEOUT_MS/, "OpenAI calls must have an explicit configurable timeout.");
assert.match(guideRoute, /mock-openai-timeout/, "OpenAI timeout fallback must be observable in the response source.");
assert.match(guideRoute, /mock-openai-error/, "OpenAI error fallback must be observable in the response source.");
assert.match(guideRoute, /mock-no-key/, "Missing OpenAI key fallback must be labeled separately from live OpenAI.");
assert.match(guideRoute, /saduGuidePolicy\.sourceLabel/, "OpenAI prompts must reference the structured SADU policy source.");
assert.match(saduGuidePolicy, /saduGuidePolicy/, "A structured SADU guide policy source must exist.");
assert.match(saduGuidePolicy, /makePolicyChecklist/, "Checklist generation must use the policy source.");
assert.match(saduGuidePolicy, /findPolicyIssues/, "Missing and inconsistent detail checks must use the policy source.");
assert.match(saduGuidePolicy, /makePolicySummary/, "Reviewer summaries must use the policy source.");
assert.match(saduGuidePolicy, /makePolicyClarificationDraft/, "Clarification drafts must use the policy source.");
assert.match(appComponent, /applicationId: selectedApp\.id/, "Guide generation should send only the selected application id.");
assert.doesNotMatch(appComponent, /application: selectedApp/, "Guide generation must not post the selected application object.");
assert.match(appComponent, /guideSourceLabel/, "Guide UI must label the current guidance source.");
assert.match(appComponent, /mock-openai-timeout/, "Guide UI must expose timeout fallback state.");
assert.match(appComponent, /Access-controlled Convex audit/, "Guide audit history should describe access-controlled Convex logs.");
assert.match(convexSchema, /actorId: v\.string\(\)/, "Guide audit logs must persist the actor id.");
assert.match(convexSchema, /actorRole: v\.string\(\)/, "Guide audit logs must persist the actor role.");
assert.match(convexGuide, /await assertCanReadApplication\(ctx, args\.actor, args\.applicationId\)/, "Convex guide logs must enforce application read access.");
assert.match(convexGuide, /actorId: args\.actor\.id/, "Convex guide logs must record the generating actor id.");
assert.match(convexGuide, /actorRole: args\.actor\.role/, "Convex guide logs must record the generating actor role.");

for (const route of [
  "/api/convex-applications/:path*",
  "/api/convex-users/:path*",
  "/api/convex-workflow/:path*",
  "/api/guide-logs/:path*",
  "/api/tams-guide/:path*",
]) {
  assert.match(middleware, new RegExp(route.replace(/[/*]/g, "\\$&")), `${route} should require an authenticated session.`);
}

console.log("Access auth check passed: session identity, role-scoped reads, spoofing defenses, SADU/admin-only actions, and owner-only edits are enforced.");
