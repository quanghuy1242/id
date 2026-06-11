import { authApiGetOrThrow, type ConsoleScopeEnvelope } from "@idco/lib";

export async function getConsoleScopes(): Promise<ConsoleScopeEnvelope> {
  return authApiGetOrThrow<ConsoleScopeEnvelope>("/admin/console-scopes");
}
