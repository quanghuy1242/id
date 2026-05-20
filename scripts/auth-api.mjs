#!/usr/bin/env node
import { readSession, requireWranglerLogin } from "./auth-api-shared.mjs";

function usage() {
  console.error("Usage: pnpm auth:api <METHOD> <PATH> [inline-json]");
}

const [, , methodArg, pathArg, bodyArg] = process.argv;
if (!methodArg || !pathArg) {
  usage();
  process.exit(1);
}

try {
  requireWranglerLogin();
  const session = await readSession();
  const method = methodArg.toUpperCase();
  const url = new URL(pathArg, session.origin);
  const headers = {
    accept: "application/json",
    cookie: session.cookie,
  };

  let body;
  if (bodyArg) {
    JSON.parse(bodyArg);
    headers["content-type"] = "application/json";
    body = bodyArg;
  }

  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  console.log(text || `${response.status} ${response.statusText}`);
  if (!response.ok) {
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
