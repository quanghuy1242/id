#!/usr/bin/env node
// Guard: the committed pnpm-lock.yaml must always describe the published
// @idco/* registry graph, never a local dev:link overlay. A lockfile produced
// with IDCO_LINK=1 records `link:` entries pointing at the sibling ~/pjs/idco
// checkout; if that were committed, a fresh clone or CI `--frozen-lockfile`
// install would break. Run this before committing (or wire it as a pre-commit
// hook). CI also runs `--frozen-lockfile`, which fails loudly on the same drift.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const write = (stream, message) => stream.write(message);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = path.join(root, "pnpm-lock.yaml");

const lock = await readFile(lockPath, "utf8");
const offending = lock
  .split("\n")
  .map((line, i) => [i + 1, line])
  .filter(([, line]) => /link:.*\bidco\b/.test(line) || /idco\/packages\/(ui|lib)/.test(line));

if (offending.length > 0) {
  write(
    process.stderr,
    "pnpm-lock.yaml contains local @idco link entries — it was generated in dev:link mode.\n" +
      "Run `pnpm dev:unlink` (or restore the lockfile from git) before committing:\n",
  );
  for (const [n, line] of offending.slice(0, 10)) {
    write(process.stderr, `  ${n}: ${line.trim()}\n`);
  }
  process.exit(1);
}

write(process.stdout, "pnpm-lock.yaml is registry-clean (no @idco link overlay).\n");
