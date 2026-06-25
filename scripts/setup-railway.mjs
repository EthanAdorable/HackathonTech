import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = new Map(
  process.argv.slice(2).flatMap((arg, index, all) => {
    if (!arg.startsWith("--")) return [];
    const [key, inline] = arg.slice(2).split("=");
    const value = inline ?? all[index + 1];
    return [[key, value && !String(value).startsWith("--") ? value : "true"]];
  }),
);

const project = args.get("project") || process.env.TAMS_RAILWAY_PROJECT || "tams-hub-prototype";
const providedProjectId = args.get("project-id") || process.env.TAMS_RAILWAY_PROJECT_ID || "";
const workspace = args.get("workspace") || process.env.TAMS_RAILWAY_WORKSPACE;
const environment = args.get("environment") || process.env.TAMS_RAILWAY_ENVIRONMENT || "";
const service = args.get("service") || process.env.TAMS_RAILWAY_SERVICE || "";
const appUrl = args.get("app-url") || process.env.TAMS_RAILWAY_APP_URL || "";
const deploy = args.has("deploy");
const createDomain = args.has("domain");
const dryRun = args.has("dry-run");

if (args.has("help") || args.has("h")) {
  console.log(`Usage: node scripts/setup-railway.mjs [--workspace <workspace>] [--project tams-hub-prototype] [--project-id <id>] [--environment <env>] [--service <service>] [--app-url https://...] [--domain] [--deploy] [--dry-run]

Creates the dedicated Railway project after Railway login is complete, sets
runtime variables from local env values with secret output redacted, and
optionally creates a Railway domain or starts a detached deployment.

Environment read from process env or .env.local:
  NEXTAUTH_SECRET
  NEXTAUTH_URL or TAMS_RAILWAY_APP_URL / --app-url for Railway auth callbacks
  OPENAI_MODEL
  NEXT_PUBLIC_CONVEX_URL
  OPENAI_API_KEY (optional, set only when present)

Use --project-id to target an existing dedicated Railway project. Without it,
the helper creates a project named ${project} and uses the returned project ID
for all variable, domain, and deploy commands.`);
  process.exit(0);
}

const localEnv = readLocalEnv();

for (const [label, value] of [
  ["project", project],
  ["project-id", providedProjectId],
  ["workspace", workspace],
  ["environment", environment],
  ["service", service],
]) {
  if (value === "true") {
    console.error(`Missing Railway ${label} value. Re-run with --${label} <value>.`);
    process.exit(1);
  }
}

function readLocalEnv() {
  if (!existsSync(".env.local")) return {};
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function envValue(key) {
  return process.env[key] || localEnv[key] || "";
}

function isLoopbackUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function isHttpUrl(value) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isPrototypeSecret(value) {
  return value === "replace-with-a-local-secret" || value === "local-tams-hub-prototype-secret";
}

let nextAuthUrl = appUrl || envValue("NEXTAUTH_URL");
if (nextAuthUrl && !isHttpUrl(nextAuthUrl)) {
  console.error("Invalid Railway NEXTAUTH_URL/app URL. Pass an absolute http(s) URL, such as --app-url https://<railway-domain>.");
  process.exit(1);
}
const nextAuthUrlIsLoopback = nextAuthUrl && isLoopbackUrl(nextAuthUrl);

if (nextAuthUrlIsLoopback) {
  if (deploy) {
    console.error("Refusing to deploy with Railway NEXTAUTH_URL set to a localhost address.");
    console.error("Pass --app-url https://<railway-domain> or set TAMS_RAILWAY_APP_URL after Railway assigns a public domain.");
    process.exit(1);
  }

  console.log("[SKIP] NEXTAUTH_URL is a local callback URL; pass --app-url or TAMS_RAILWAY_APP_URL after Railway assigns a public domain.");
  nextAuthUrl = "";
}

function run(label, command, commandArgs, options = {}) {
  const printable = [command, ...commandArgs.map((value) => (options.secretArgs?.has(value) ? "<redacted>" : value))].join(" ");
  console.log(`${dryRun ? "[DRY-RUN]" : "[RUN]"} ${label}: ${printable}`);
  if (dryRun) return { status: 0, output: "" };

  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: options.capture ? "pipe" : "inherit",
  });

  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0 && !options.allowFailure) {
    if (options.capture && output.trim()) console.error(output.trim());
    process.exit(result.status ?? 1);
  }

  return { status: result.status ?? 0, output };
}

run("Check Railway auth", "railway", ["whoami", "--json"]);

let railwayProjectId = providedProjectId;
if (railwayProjectId) {
  run("Link dedicated Railway project", "railway", [
    "link",
    "--project",
    railwayProjectId,
    ...(workspace ? ["--workspace", workspace] : []),
    ...(environment ? ["--environment", environment] : []),
    ...(service ? ["--service", service] : []),
    "--json",
  ]);
} else {
  const initResult = run("Create/link dedicated Railway project", "railway", [
    "init",
    "--name",
    project,
    ...(workspace ? ["--workspace", workspace] : []),
    "--json",
  ], { capture: true });
  railwayProjectId = dryRun ? "<created-project-id>" : extractProjectId(initResult.output);
  if (!railwayProjectId) {
    console.error("Could not determine the Railway project ID from `railway init --json`. Re-run with --project-id <id>.");
    process.exit(1);
  }
}

const railwayContextArgs = [
  "--project",
  railwayProjectId,
  ...(environment ? ["--environment", environment] : []),
  ...(service ? ["--service", service] : []),
];

const variables = {
  NEXTAUTH_SECRET: envValue("NEXTAUTH_SECRET"),
  NEXTAUTH_URL: nextAuthUrl,
  TAMS_DEMO_AUTH_ENABLED: "false",
  OPENAI_MODEL: envValue("OPENAI_MODEL") || "gpt-4o-mini",
  NEXT_PUBLIC_CONVEX_URL: envValue("NEXT_PUBLIC_CONVEX_URL"),
  OPENAI_API_KEY: envValue("OPENAI_API_KEY"),
};

for (const [key, value] of Object.entries(variables)) {
  if (!value) {
    console.log(`[SKIP] ${key} is empty locally; set it later with railway variable set ${key}=...`);
    continue;
  }
  if (key === "NEXTAUTH_SECRET" && isPrototypeSecret(value)) {
    if (deploy) {
      console.error("Refusing to deploy with the local prototype NEXTAUTH_SECRET. Set a production secret and rerun.");
      process.exit(1);
    }
    console.log("[SKIP] NEXTAUTH_SECRET uses a local prototype value; set a production secret before Railway deployment.");
    continue;
  }
  const pair = `${key}=${value}`;
  run(`Set ${key}`, "railway", ["variable", "set", pair, ...railwayContextArgs, "--skip-deploys", "--json"], {
    secretArgs: new Set([pair]),
  });
}

if (createDomain) {
  run("Create Railway-provided domain", "railway", ["domain", ...railwayContextArgs, "--json"]);
}

if (deploy) {
  run("Deploy to Railway", "railway", ["up", ...railwayContextArgs, "--detach", "-y", "-m", "Deploy TAMS Hub prototype"]);
} else {
  console.log("[INFO] Skipped deployment. Re-run with --deploy after variables and domain are ready.");
}

console.log("Railway setup script finished. Run corepack pnpm services:check with TAMS_HUB_HEALTH_URL after deployment.");

function extractProjectId(output) {
  const trimmed = output.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed);
    return findProjectId(parsed);
  } catch {
    const match = trimmed.match(/\bproject(?:Id)?["'\s:=]+([A-Za-z0-9_-]+)/i);
    return match?.[1] ?? "";
  }
}

function findProjectId(value) {
  if (!value || typeof value !== "object") return "";
  if ("projectId" in value && typeof value.projectId === "string") return value.projectId;
  if ("project" in value) {
    const projectValue = value.project;
    if (typeof projectValue === "string") return projectValue;
    if (projectValue && typeof projectValue === "object" && typeof projectValue.id === "string") return projectValue.id;
  }
  if ("id" in value && typeof value.id === "string") return value.id;

  for (const child of Object.values(value)) {
    const found = findProjectId(child);
    if (found) return found;
  }
  return "";
}
