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
corepack pnpm setup:convex -- --team <team-slug> --dry-run
corepack pnpm setup:convex -- --team <team-slug>
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
corepack pnpm setup:railway -- --dry-run
corepack pnpm setup:railway
```

The setup script will not copy a local `NEXTAUTH_URL` such as `http://127.0.0.1:3000` into Railway. After Railway assigns a public URL, pass it with `--app-url` or set `TAMS_RAILWAY_APP_URL`.

Set the initial variables after Convex provides a URL:

```powershell
railway variable set NEXTAUTH_SECRET=<production-secret>
railway variable set TAMS_DEMO_AUTH_ENABLED=false
railway variable set OPENAI_MODEL=gpt-4o-mini
railway variable set NEXT_PUBLIC_CONVEX_URL=<convex-url>
```

`OPENAI_API_KEY` is optional for the prototype because TAMS Guide has a mock fallback:

```powershell
railway variable set OPENAI_API_KEY=<optional-key>
```

Create a Railway-provided domain, then deploy with the public auth callback URL:

```powershell
corepack pnpm setup:railway -- --domain
railway domain
corepack pnpm setup:railway -- --app-url https://<railway-domain> --deploy
```

You can also set the public URL through an environment variable:

```powershell
$env:TAMS_RAILWAY_APP_URL="https://<railway-domain>"
corepack pnpm setup:railway -- --deploy
```

Evidence checks:

```powershell
$env:TAMS_DEPLOY_CHECK="1"; $env:TAMS_HUB_HEALTH_URL="https://<railway-domain>"; corepack pnpm services:check
railway status --json
railway service status --all --json
railway variable list --json
railway logs --lines 200
```

The deployed service should respond at its Railway public URL, expose `/api/health`, and run `next start` bound to `0.0.0.0` and Railway's `PORT`.
