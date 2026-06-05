import { authPluginConfig } from "../config";
import type { BetterAuthKvStorage } from "./secondary-storage";

type EmailLinkPayload = {
  readonly email: string;
  readonly token: string;
  readonly url: string;
};

function emailLinkKey(prefix: string, email: string): string {
  return `${prefix}${email.toLowerCase()}`;
}

async function storeEmailLink(
  kv: BetterAuthKvStorage,
  prefix: string,
  payload: EmailLinkPayload,
): Promise<void> {
  await kv.put(emailLinkKey(prefix, payload.email), JSON.stringify(payload));
}

export async function storeVerificationEmailLink(
  kv: BetterAuthKvStorage,
  payload: EmailLinkPayload,
): Promise<void> {
  await storeEmailLink(
    kv,
    authPluginConfig.emailVerificationStoragePrefix,
    payload,
  );
}

export async function storePasswordResetEmailLink(
  kv: BetterAuthKvStorage,
  payload: EmailLinkPayload,
): Promise<void> {
  await storeEmailLink(
    kv,
    authPluginConfig.passwordResetStoragePrefix,
    payload,
  );
}
