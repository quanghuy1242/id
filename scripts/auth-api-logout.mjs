#!/usr/bin/env node
import { clearSession } from "./auth-api-shared.mjs";

await clearSession();
console.log("Cleared cached Better Auth session.");
