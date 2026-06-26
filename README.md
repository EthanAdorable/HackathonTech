# TAMS Hub Prototype

TAMS Hub is an AI-assisted, role-based campus workflow prototype for FEU Alabang student organization event filing. It replaces scattered email threads with one place for templates, SADU review, approval tracking, revision requests, messages, and AI guidance placeholders.

The current source of truth is `C:/Users/kdrf/Downloads/Tams-Hub.docx`.

## Stack

- Next.js App Router with TypeScript
- Convex schema/functions provisioned on a dedicated prototype project
- NextAuth credentials structure for future real providers
- OpenAI API route abstraction with deterministic mock fallback
- Railway-ready configuration

## Run Locally

```bash
corepack pnpm install
corepack pnpm dev
```

Open `http://127.0.0.1:3000`.

If pnpm asks about dependency build approval, run:

```bash
corepack pnpm approve-builds --all
corepack pnpm install
```

## Environment Variables

Copy `.env.example` to `.env.local`.

```bash
NEXTAUTH_SECRET=replace-with-a-local-secret
NEXTAUTH_URL=http://127.0.0.1:3000
TAMS_DEMO_AUTH_ENABLED=true
# Optional override for services:check
# TAMS_HUB_HEALTH_URL=http://127.0.0.1:3000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
CONVEX_DEPLOYMENT=dev:zealous-ocelot-537
NEXT_PUBLIC_CONVEX_URL=https://zealous-ocelot-537.convex.cloud
TAMS_CONVEX_PROJECT=tams-hub-prototype
TAMS_RAILWAY_PROJECT=TAMS Hub
TAMS_RAILWAY_PROJECT_ID=
```

`OPENAI_API_KEY` is optional. Without it, TAMS Guide returns deterministic mock guidance so the demo still works.

## Prototype Users

- Student Officer: Juan Reyes, Secretary of JPCS
- SADU Associate
- Faculty Adviser
- Admin

The visible role switcher simulates TAMS Access with OTP and NFC/card-tap verification. The NextAuth route at `/api/auth/[...nextauth]` is included as the structured auth placeholder for real credentials or campus providers later. `TAMS_DEMO_AUTH_ENABLED=true` keeps credentials role switching available for local prototype demos; leave it unset or false for public deploys unless demo access is intentional.

## Main Modules

- TAMS Access: role-based login simulation and NextAuth-ready credentials provider
- TAMS Events: application list, status tracker, template editor, queue, revision loop, approval/rejection actions, and messages
- TAMS Guide: checklist generation, missing-field checks, SADU summary, revision draft, and basic filing answers
- Admin: user/role visibility and prototype template availability toggles

## Demo Path QA

- Student Officer role opens a dashboard with JPCS applications.
- Student creates a new event with `File New Event`.
- Student fills required template fields in the completion editor.
- Student runs `Run AI Completeness Check`; the timeline records `AI Pre-check`.
- TAMS Guide can generate a checklist, missing fields, summary, revision draft, and filing answer.
- Student submits to SADU once the prototype completion threshold is met.
- SADU Associate role sees the queue and opens submitted or resubmitted applications.
- SADU marks an application under review.
- SADU requests revision; the message thread receives a revision draft and the status changes.
- Student Officer updates missing fields and resubmits.
- SADU approves or rejects; status and timeline update across roles.
- Faculty Adviser can view organization applications and add an endorsement note to the review thread.
- Admin can inspect all applications and toggle template availability in prototype form.
- Admin dashboard shows service readiness for Convex/Railway and can reset local demo data.

## Convex Notes

Convex files live in `convex/`:

- `schema.ts` defines users, applications, templates, messages, and timeline tables.
- `applications.ts` includes list, status update, and message mutations.
- `seed.ts` mirrors the prototype seed data for backend initialization.

The dedicated Convex project is configured under `conneura/tams-hub-prototype` with dev deployment `dev:zealous-ocelot-537` and `NEXT_PUBLIC_CONVEX_URL=https://zealous-ocelot-537.convex.cloud`. Convex functions have been generated, pushed, and seeded.

The running MVP loads seeded applications from the dedicated Convex deployment when `NEXT_PUBLIC_CONVEX_URL` is configured. New application creation, template field edits, admin template availability, status transitions, revision requests, approvals, rejections, endorsements, messages, and TAMS Guide audit logs sync through Convex-backed routes, with local optimistic fallback for prototype speed. Recent TAMS Guide runs are visible in the Guide workbench as a lightweight audit history.

## Railway Notes

`railway.json` uses Nixpacks and starts the app with:

```bash
corepack pnpm start
```

The detailed Convex and Railway setup runbook is in `docs/service-setup.md`. External project creation is intentionally separate for each service. Convex is already on its dedicated project; the dedicated Railway project has been identified and stored locally through `TAMS_RAILWAY_PROJECT_ID`, while CLI auth, service selection, domain, and deployment still require Railway login.

Set these Railway variables:

- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `OPENAI_API_KEY`, optional
- `OPENAI_MODEL`, optional
- `NEXT_PUBLIC_CONVEX_URL=https://zealous-ocelot-537.convex.cloud`
- `TAMS_RAILWAY_PROJECT_ID`, set to the dedicated Railway project target

Build command can remain Railway/Nixpacks default, or be set to:

```bash
corepack pnpm install && corepack pnpm build
```

## Scripts

```bash
corepack pnpm dev
corepack pnpm build
corepack pnpm demo:check
corepack pnpm start
corepack pnpm services:check
corepack pnpm setup:convex -- --team <team-slug> --dry-run
corepack pnpm convex:codegen
corepack pnpm setup:railway -- --workspace <workspace> --dry-run
corepack pnpm setup:railway -- --project-id <railway-project-id> --environment production --service <service-name> --dry-run
```

`demo:check` verifies the seeded roles, required templates, revision loop, SADU approval transition, and TAMS Guide helper outputs.

When checking a running deployment, set `TAMS_HUB_HEALTH_URL` to the app URL so `services:check` probes `/api/health`. Set `TAMS_DEPLOY_CHECK=1` to fail on deploy-unsafe auth values such as localhost `NEXTAUTH_URL` or the local prototype `NEXTAUTH_SECRET`. The script reports account setup gaps as `WAIT` and optional fallbacks as `INFO`; only failed health checks or deploy-mode env errors return a failure exit code.

`setup:convex` and `setup:railway` are guarded provisioning helpers for the dedicated external projects. Convex has already been provisioned under `conneura`; rerun `setup:convex` only to refresh functions or seed data. Use Railway dry-runs first; the real Railway commands should only run after Railway account/workspace ownership is confirmed. Omit `--workspace` only after Railway CLI is authenticated to the intended workspace. The local Railway project ID now identifies the dedicated project, but still pass `--project-id`, `--environment`, and `--service` so variables, domains, and deployments target that project explicitly.

## Current Limitations

- Compliance and formal policy validation are intentionally future scope.
- TAMS Guide is guidance only and never final approval.
- Final approval, rejection, and revision decisions remain with SADU and human reviewers.
- Seeded application reads, application creation, template edits, template availability, workflow actions, and TAMS Guide audit logs come from Convex when configured, with local fallback for prototype demos.
- OTP/NFC access is simulated for the prototype.
