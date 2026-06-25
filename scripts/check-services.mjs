import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const checks = [];

function run(label, command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  checks.push({
    label,
    ok: result.status === 0,
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
    return { ok: false, output: ".env.local is missing" };
  }

  const env = readFileSync(".env.local", "utf8");
  const required = ["NEXTAUTH_SECRET", "NEXTAUTH_URL", "CONVEX_DEPLOYMENT", "NEXT_PUBLIC_CONVEX_URL"];
  const present = required.filter((key) => new RegExp(`^${key}=.+`, "m").test(env));
  return {
    ok: present.length === required.length,
    output: `present: ${present.join(", ") || "none"}`,
  };
}

run("Convex login", "corepack", ["pnpm", "convex", "login", "status"]);
run("Railway CLI", "railway", ["--version"]);
run("Railway auth", "railway", ["whoami", "--json"]);
checks.push({ label: "Local env", ...envSummary() });
checks.push({
  label: "OpenAI env",
  ok: Boolean(process.env.OPENAI_API_KEY),
  output: process.env.OPENAI_API_KEY ? "OPENAI_API_KEY is set" : "OPENAI_API_KEY is not set; mock guide fallback will be used",
});
checks.push({
  label: "Railway runtime env",
  ok: Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID),
  output: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || "Not running inside Railway",
});

for (const check of checks) {
  const icon = check.ok ? "OK" : "WAIT";
  console.log(`[${icon}] ${check.label}`);
  if (check.output) {
    console.log(check.output.split("\n").slice(0, 8).join("\n"));
  }
}

const failed = checks.filter((check) => !check.ok).length;
if (failed) {
  process.exitCode = 1;
}
