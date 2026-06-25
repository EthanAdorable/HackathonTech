import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const checks = [];
const localEnv = readLocalEnv();
const deployCheck = process.env.TAMS_DEPLOY_CHECK === "1" || Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);

function readLocalEnv() {
  if (!existsSync(".env.local")) {
    return {};
  }

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

function run(label, command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  checks.push({
    label,
    status: result.status === 0 ? "ok" : "wait",
    output: sanitize(`${result.stdout || ""}${result.stderr || ""}`.trim()),
  });
}

function sanitize(value) {
  return value
    .replace(/accessToken["'\s:=]+[A-Za-z0-9._-]+/gi, "accessToken=<redacted>")
    .replace(/CONVEX_DEPLOY_KEY=[^\s]+/gi, "CONVEX_DEPLOY_KEY=<redacted>")
    .replace(/OPENAI_API_KEY=[^\s]+/gi, "OPENAI_API_KEY=<redacted>");
}

function envSummary() {
  const required = ["NEXTAUTH_SECRET", "NEXTAUTH_URL"];
  const present = required.filter((key) => envValue(key));
  const missing = required.filter((key) => !envValue(key));
  const optional = ["CONVEX_DEPLOYMENT", "NEXT_PUBLIC_CONVEX_URL"];
  const optionalPresent = optional.filter((key) => envValue(key));
  const warnings = deployEnvWarnings();
  const status = missing.length ? (deployCheck ? "fail" : "wait") : deployCheck && warnings.length ? "fail" : "ok";
  const deployNote = deployCheck ? "deploy check: on" : "deploy check: off";
  const missingText = missing.length ? `; missing: ${missing.join(", ")}` : "";
  const warningText = warnings.length ? `; warnings: ${warnings.join("; ")}` : "";

  return {
    status,
    output: `required present: ${present.join(", ") || "none"}; optional present: ${optionalPresent.join(", ") || "none"}; ${deployNote}${missingText}${warningText}`,
  };
}

function envValue(key) {
  return process.env[key] || localEnv[key] || "";
}

function deployEnvWarnings() {
  const warnings = [];
  const nextAuthSecret = process.env.NEXTAUTH_SECRET || localEnv.NEXTAUTH_SECRET || "";
  const nextAuthUrl = process.env.NEXTAUTH_URL || localEnv.NEXTAUTH_URL || "";
  const demoAuthEnabled = process.env.TAMS_DEMO_AUTH_ENABLED || localEnv.TAMS_DEMO_AUTH_ENABLED || "";

  if (nextAuthSecret === "replace-with-a-local-secret" || nextAuthSecret === "local-tams-hub-prototype-secret") {
    warnings.push("NEXTAUTH_SECRET uses a local prototype value");
  }

  if (isLoopbackUrl(nextAuthUrl)) {
    warnings.push("NEXTAUTH_URL points to localhost");
  }

  if (demoAuthEnabled === "true") {
    warnings.push("TAMS_DEMO_AUTH_ENABLED exposes prototype role switching");
  }

  return warnings;
}

function isLoopbackUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

async function healthSummary() {
  const baseUrl = process.env.TAMS_HUB_HEALTH_URL || process.env.NEXTAUTH_URL || localEnv.NEXTAUTH_URL;
  if (!baseUrl) {
    return { status: "wait", output: "Set TAMS_HUB_HEALTH_URL or NEXTAUTH_URL to check /api/health" };
  }

  const url = new URL("/api/health", baseUrl).toString();
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { status: "fail", output: `${url} returned HTTP ${response.status}` };
    }
    const data = await response.json();
    return { status: data.ok === true ? "ok" : "fail", output: `${url} -> ${JSON.stringify(data.services)}` };
  } catch (error) {
    return { status: "fail", output: `${url} unavailable: ${error instanceof Error ? error.message : String(error)}` };
  }
}

run("Convex login", "corepack", ["pnpm", "convex", "login", "status"]);
run("Railway CLI", "railway", ["--version"]);
run("Railway auth", "railway", ["whoami", "--json"]);
checks.push({ label: "Local env", ...envSummary() });
checks.push({ label: "App health", ...(await healthSummary()) });
checks.push({
  label: "OpenAI env",
  status: "info",
  output: process.env.OPENAI_API_KEY || localEnv.OPENAI_API_KEY ? "OPENAI_API_KEY is set" : "OPENAI_API_KEY is not set; mock guide fallback will be used",
});
checks.push({
  label: "Railway runtime env",
  status: process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID ? "ok" : "info",
  output: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || "Not running inside Railway",
});

for (const check of checks) {
  const icon = check.status.toUpperCase();
  console.log(`[${icon}] ${check.label}`);
  if (check.output) {
    console.log(check.output.split("\n").slice(0, 8).join("\n"));
  }
}

const failed = checks.filter((check) => check.status === "fail").length;
if (failed) {
  process.exitCode = 1;
}
