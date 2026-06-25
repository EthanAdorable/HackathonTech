# TAMS Hub Prototype

TAMS Hub is an AI-assisted, role-based campus workflow prototype for FEU Alabang student organization event filing. It replaces scattered email threads with one place for templates, SADU review, approval tracking, revision requests, messages, and AI guidance placeholders.

The current source of truth is `C:/Users/kdrf/Downloads/Tams-Hub.docx`.

## Stack

- Next.js App Router with TypeScript
- Convex schema/functions prepared for persistence
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
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=
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
- Student creates a new event with `New event`.
- Student fills required template fields in the completion editor.
- Student runs `Run pre-check`; the timeline records `AI Pre-check`.
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

The running MVP currently uses local browser storage for demo speed. `app/providers.tsx` already enables `ConvexProvider` when `NEXT_PUBLIC_CONVEX_URL` exists, so the next migration step is replacing local state in `components/tams-hub-app.tsx` with Convex hooks after project setup.

## Railway Notes

`railway.json` uses Nixpacks and starts the app with:

```bash
corepack pnpm start
```

The detailed Convex and Railway setup runbook is in `docs/service-setup.md`. External project creation is intentionally separate for each service.

Set these Railway variables:

- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `OPENAI_API_KEY`, optional
- `OPENAI_MODEL`, optional
- `NEXT_PUBLIC_CONVEX_URL`, when Convex is connected

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
corepack pnpm setup:railway -- --dry-run
```

`demo:check` verifies the seeded roles, required templates, revision loop, SADU approval transition, and TAMS Guide helper outputs.

When checking a running deployment, set `TAMS_HUB_HEALTH_URL` to the app URL so `services:check` probes `/api/health`. Set `TAMS_DEPLOY_CHECK=1` to fail on deploy-unsafe auth values such as localhost `NEXTAUTH_URL` or the local prototype `NEXTAUTH_SECRET`. The script reports account setup gaps as `WAIT` and optional fallbacks as `INFO`; only failed health checks or deploy-mode env errors return a failure exit code.

`setup:convex` and `setup:railway` are guarded provisioning helpers for the dedicated external projects. Use `--dry-run` first; the real commands should only run after the Convex team and Railway account/workspace choices are confirmed.

## Current Limitations

- Compliance and formal policy validation are intentionally future scope.
- TAMS Guide is guidance only and never final approval.
- Final approval, rejection, and revision decisions remain with SADU and human reviewers.
- Persistence is local browser storage in the UI until Convex is wired into the frontend.
- OTP/NFC access is simulated for the prototype.
