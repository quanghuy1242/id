import { createSenderAuthEmailSender } from "./sender-email";
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
  return createSenderAuthEmailSender({
    apiToken: env.SENDER_API_TOKEN ?? "",
    fromEmail: env.EMAIL_FROM ?? "",
    fromName: env.EMAIL_FROM_NAME ?? "id",
  });
}
