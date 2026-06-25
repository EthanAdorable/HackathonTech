import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const checks = [];
const localEnv = readLocalEnv();

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
  if (!existsSync(".env.local")) {
    return { status: "wait", output: ".env.local is missing" };
  }

  const env = readFileSync(".env.local", "utf8");
  const required = ["NEXTAUTH_SECRET", "NEXTAUTH_URL"];
  const present = required.filter((key) => new RegExp(`^${key}=.+`, "m").test(env));
  const optional = ["CONVEX_DEPLOYMENT", "NEXT_PUBLIC_CONVEX_URL"];
  const optionalPresent = optional.filter((key) => new RegExp(`^${key}=.+`, "m").test(env));
  return {
    status: present.length === required.length ? "ok" : "wait",
    output: `required present: ${present.join(", ") || "none"}; optional present: ${optionalPresent.join(", ") || "none"}`,
  };
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
