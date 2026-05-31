import { authApiGetOrThrow, type ConsoleScopeEnvelope } from "@id/lib";

export async function getConsoleScopes(): Promise<ConsoleScopeEnvelope> {
  return authApiGetOrThrow<ConsoleScopeEnvelope>("/admin/console-scopes");
}
