# Service Setup Runbook

This prototype uses separate external projects:

- Convex project: `tams-hub-prototype`
- Railway project: `tams-hub-prototype`

Do not reuse an unrelated Convex or Railway project for this app.

## Current Account Choices Needed

Convex is logged in locally and can access two teams:

- `conneura`
- `gwyneth-betonio`

Railway CLI is installed, but the browser OAuth flow is paused at GitHub account selection:

- `Xylodex`
- `ItchyDitchy`

Project creation should continue only after those ownership choices are confirmed.

## Convex Setup

Create the project under the chosen team:

```powershell
corepack pnpm convex project create tams-hub-prototype --team <team-slug>
corepack pnpm convex dev --once --configure new --team <team-slug> --project tams-hub-prototype --dev-deployment cloud
```

Expected local artifacts:

- `.env.local` with `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- generated Convex files under `convex/_generated/`

Seed the prototype data after deployment configuration. The seed command resets the prototype tables before inserting the demo rows, so it is safe to rerun during setup.

```powershell
corepack pnpm convex run seed:seedDemoData
```

Evidence checks:

```powershell
corepack pnpm services:check
corepack pnpm convex login status
corepack pnpm convex data
corepack pnpm convex run applications:list '{}'
```

Workflow mutations prepared for frontend wiring after project configuration:

- `applications:updateTemplate`
- `applications:updateStatus`
- `applications:requestRevision`
- `applications:resubmit`
- `applications:approve`
- `applications:reject`
- `applications:addEndorsement`

## Railway Setup

Log in through the selected GitHub account:

```powershell
railway login
railway whoami --json
```

Create a separate Railway project from this repo:

```powershell
railway init --name tams-hub-prototype
```

Set variables after Convex provides a URL:

```powershell
railway variable set NEXTAUTH_SECRET=<production-secret>
railway variable set NEXTAUTH_URL=https://<railway-domain>
railway variable set OPENAI_MODEL=gpt-4o-mini
railway variable set NEXT_PUBLIC_CONVEX_URL=<convex-url>
```

`OPENAI_API_KEY` is optional for the prototype because TAMS Guide has a mock fallback:

```powershell
railway variable set OPENAI_API_KEY=<optional-key>
```

Deploy:

```powershell
railway up --detach -m "Initial TAMS Hub deployment"
```

Evidence checks:

```powershell
$env:TAMS_HUB_HEALTH_URL="https://<railway-domain>"; corepack pnpm services:check
corepack pnpm services:check
railway status --json
railway service status --all --json
railway variable list --json
railway logs --lines 200
```

The deployed service should respond at its Railway public URL, expose `/api/health`, and run `next start` bound to `0.0.0.0` and Railway's `PORT`.
