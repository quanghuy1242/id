import { execFile } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const tsc = resolve(root, "node_modules", ".bin", "tsc");

const projects = [
  "packages/lib/tsconfig.json",
  "packages/ui/tsconfig.json",
  "workers/core/tsconfig.json",
  "workers/ui/tsconfig.json",
];

let failed = false;
await Promise.all(
  projects.map(
    (p) =>
      new Promise((resolve) => {
        const child = execFile(tsc, ["-p", p, "--noEmit"], { cwd: root }, (error, stdout, stderr) => {
          if (stdout) process.stdout.write(stdout);
          if (stderr) process.stderr.write(stderr);
          if (error) failed = true;
          resolve(error ? 1 : 0);
        });
      }),
  ),
);

process.exit(failed ? 1 : 0);