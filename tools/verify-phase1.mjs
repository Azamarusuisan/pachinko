import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const commands = [
  ["npm", ["run", "verify:structure"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "lint"]],
  ["npm", ["test"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "simulate:100"]],
  ["npm", ["run", "simulate:1000"]],
  ["npm", ["run", "simulate:10000"]],
];

for (const [command, args] of commands) {
  process.stdout.write(`\n>>> ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`Phase 1 verification stopped with exit ${result.status ?? "unknown"}.\n`);
    process.exit(result.status ?? 1);
  }
}
process.stdout.write("\nAll automated Phase 1 gates passed. Manual Safari/Chrome verification remains a separate recorded gate.\n");
