import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

export const sessionPath = join(homedir(), ".config", "id", "auth-api-session.json");

export function requireWranglerLogin() {
  const result = spawnSync("pnpm", ["wrangler", "whoami"], { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error("Wrangler login is required before auth API calls. Run `pnpm wrangler login`.");
  }
}

export async function readSession() {
  const raw = await readFile(sessionPath, "utf8").catch(() => null);
  if (!raw) {
    throw new Error("No cached Better Auth session. Run `pnpm auth:api:login <origin> <email>` first.");
  }

  const parsed = JSON.parse(raw);
  if (typeof parsed.origin !== "string" || typeof parsed.cookie !== "string") {
    throw new Error("Cached Better Auth session is invalid. Run `pnpm auth:api:logout` and sign in again.");
  }

  return parsed;
}

export async function writeSession(session) {
  await mkdir(dirname(sessionPath), { recursive: true });
  await writeFile(sessionPath, JSON.stringify(session, null, 2), { mode: 0o600 });
}

export async function clearSession() {
  await rm(sessionPath, { force: true });
}
