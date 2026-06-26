# Service Setup Runbook

This prototype uses separate external projects:

- Convex project: `tams-hub-prototype`
- Railway project: `TAMS Hub`

Do not reuse an unrelated Convex or Railway project for this app.

## Current External Setup State

Convex is configured for the dedicated project:

- Team: `conneura`
- Project: `tams-hub-prototype`
- Dev deployment: `dev:zealous-ocelot-537`
- Client URL: `https://zealous-ocelot-537.convex.cloud`
- Dashboard: `https://dashboard.convex.dev/t/conneura/tams-hub-prototype/zealous-ocelot-537`

Convex functions have been generated, pushed, and seeded for the prototype demo data.

The dedicated Railway project is identified in the browser and should be targeted explicitly:

- Project: `TAMS Hub`
- Project ID: stored locally as `TAMS_RAILWAY_PROJECT_ID`

Railway CLI is installed, but local CLI auth is still pending. Continue setup only after Railway login is completed for the intended account/workspace; do not create or link an unrelated Railway project.

## Convex Setup

Create or refresh the project under the selected team:

```powershell
corepack pnpm setup:convex -- --team <team-slug> --dry-run
corepack pnpm setup:convex -- --team <team-slug>
```

Expected local artifacts:

- `.env.local` with `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- generated Convex files under `convex/_generated/`

The setup helper runs `corepack pnpm convex:codegen` after selecting the deployment so official Convex runtime files are committed from the configured project state. It also runs `seed:seedDemoData` before finishing.

Rerun the seed command manually if setup is interrupted or if you need to restore the demo rows. The seed command resets the prototype tables before inserting the demo rows, so it is safe to rerun during setup.

```powershell
corepack pnpm convex run seed:seedDemoData
```

Evidence checks:

```powershell
corepack pnpm services:check
corepack pnpm convex login status
corepack pnpm convex:codegen
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

Create a separate Railway project from this repo only if the dedicated project does not already exist:

```powershell
corepack pnpm setup:railway -- --workspace <workspace> --dry-run
corepack pnpm setup:railway -- --workspace <workspace>
```

Omit `--workspace` only after confirming the Railway CLI is authenticated to the intended account/workspace.

Because the dedicated Railway project already exists, pass its project ID explicitly so every variable, domain, and deploy command targets the correct project:

```powershell
corepack pnpm setup:railway -- --project-id <railway-project-id> --environment production --service <service-name> --dry-run
corepack pnpm setup:railway -- --project-id <railway-project-id> --environment production --service <service-name>
```

The setup script will not copy a local `NEXTAUTH_URL` such as `http://127.0.0.1:3000` into Railway. After Railway assigns a public URL, pass it with `--app-url` or set `TAMS_RAILWAY_APP_URL`.
The setup script also skips local prototype `NEXTAUTH_SECRET` placeholders; set a production secret before deployment.

Set the initial variables after Convex provides a URL:

```powershell
railway variable set NEXTAUTH_SECRET=<production-secret>
railway variable set TAMS_DEMO_AUTH_ENABLED=false
railway variable set CODEX_LB_BASE_URL=https://codex-lb-production-6b47.up.railway.app/v1
railway variable set CODEX_LB_MODEL=gpt-5.5
railway variable set CODEX_LB_REASONING_EFFORT=medium
railway variable set NEXT_PUBLIC_CONVEX_URL=<convex-url>
```

`CODEX_LB_API_KEY` is optional for the prototype because TAMS Guide has a mock fallback:

```powershell
railway variable set CODEX_LB_API_KEY=<optional-key>
```

Create a Railway-provided domain, then deploy with the public auth callback URL:

```powershell
corepack pnpm setup:railway -- --project-id <railway-project-id> --environment production --service <service-name> --domain
railway domain
corepack pnpm setup:railway -- --project-id <railway-project-id> --environment production --service <service-name> --app-url https://<railway-domain> --deploy
```

You can also set the public URL through an environment variable:

```powershell
$env:TAMS_RAILWAY_APP_URL="https://<railway-domain>"
corepack pnpm setup:railway -- --project-id <railway-project-id> --environment production --service <service-name> --deploy
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
