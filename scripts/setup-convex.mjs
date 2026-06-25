import { spawnSync } from "node:child_process";

const args = new Map(
  process.argv.slice(2).flatMap((arg, index, all) => {
    if (!arg.startsWith("--")) return [];
    const [key, inline] = arg.slice(2).split("=");
    const value = inline ?? all[index + 1];
    return [[key, value && !String(value).startsWith("--") ? value : "true"]];
  }),
);

const project = args.get("project") || process.env.TAMS_CONVEX_PROJECT || "tams-hub-prototype";
const team = args.get("team") || process.env.TAMS_CONVEX_TEAM;
const deployment = args.get("deployment") || process.env.TAMS_CONVEX_DEPLOYMENT_REF || "dev/tams-hub-prototype";
const dryRun = args.has("dry-run");

if (args.has("help") || args.has("h")) {
  console.log(`Usage: node scripts/setup-convex.mjs --team <team-slug> [--project tams-hub-prototype] [--deployment dev/tams-hub-prototype] [--dry-run]

Creates or configures the dedicated Convex project, selects a dev deployment,
pushes Convex functions once, and seeds demo data.

Required:
  --team, or TAMS_CONVEX_TEAM

Current known team slugs from this machine:
  conneura
  gwyneth-betonio`);
  process.exit(0);
}

if (!team) {
  console.error("Missing Convex team. Re-run with --team <team-slug> after choosing the owning Convex team.");
  process.exit(1);
}

function run(label, command, commandArgs, options = {}) {
  const printable = [command, ...commandArgs].join(" ");
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

run("Check Convex login", "corepack", ["pnpm", "convex", "login", "status"]);
const create = run("Create dedicated Convex project", "corepack", ["pnpm", "convex", "project", "create", project, "--team", team], {
  allowFailure: true,
  capture: true,
});
if (create.status !== 0) {
  const alreadyExists = /already exists|already have|Project.*exists/i.test(create.output);
  if (!alreadyExists) {
    console.error(create.output.trim() || "Convex project creation failed.");
    process.exit(create.status);
  }
  console.log("[INFO] Convex project already exists; continuing with deployment selection.");
}

run("Create/select Convex dev deployment", "corepack", [
  "pnpm",
  "convex",
  "deployment",
  "create",
  `${team}:${project}:${deployment}`,
  "--type",
  "dev",
  "--select",
]);
run("Generate Convex client types", "corepack", ["pnpm", "convex:codegen"]);
run("Push Convex functions once", "corepack", ["pnpm", "convex", "dev", "--once"]);
run("Seed prototype data", "corepack", ["pnpm", "convex", "run", "seed:seedDemoData"]);

if (dryRun) {
  console.log("Convex setup dry-run complete. No project, deployment, function push, or seed changes were made.");
} else {
  console.log("Convex setup complete. Review .env.local and generated files under convex/_generated/.");
}
