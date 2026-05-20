#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { requireWranglerLogin, writeSession } from "./auth-api-shared.mjs";

function usage() {
  console.error("Usage: pnpm auth:api:login <origin> <email>");
}

const [, , originArg, email] = process.argv;
if (!originArg || !email) {
  usage();
  process.exit(1);
}

try {
  requireWranglerLogin();
  const origin = new URL(originArg).origin;
  const rl = createInterface({ input, output });
  const password = await rl.question("Password: ");
  rl.close();

  const response = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sign-in failed with HTTP ${response.status}: ${body}`);
  }

  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("Sign-in response did not include a session cookie.");
  }

  await writeSession({
    origin,
    cookie: cookie.split(";")[0],
    createdAt: new Date().toISOString(),
  });
  console.log(`Cached Better Auth session for ${origin}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
