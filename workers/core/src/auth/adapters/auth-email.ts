import { createResendAuthEmailSender } from "./resend-email";
import type { AuthEmailMessage, AuthEmailSender, AuthOptionsEnv, BackgroundTaskRunner } from "../types";

export async function sendAuthEmail(
  sender: AuthEmailSender,
  message: AuthEmailMessage,
  runner?: BackgroundTaskRunner,
): Promise<void> {
  const task = sender.send(message);
  if (runner) {
    runner.waitUntil(task);
    return;
  }

  await task;
}

export function createAuthEmailSender(env: AuthOptionsEnv): AuthEmailSender {
  return createResendAuthEmailSender({
    apiKey: env.RESEND_API_KEY ?? "",
    fromEmail: env.EMAIL_FROM ?? "",
    fromName: env.EMAIL_FROM_NAME ?? "id",
  });
}
