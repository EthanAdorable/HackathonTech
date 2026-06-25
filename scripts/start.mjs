import { spawn } from "node:child_process";

const port = process.env.PORT || "3000";
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", port],
  { stdio: "inherit", shell: false },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
