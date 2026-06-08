import { createResendAuthEmailSender } from "./resend-email";
import type {
  AuthEmailMessage,
  AuthEmailSender,
  AuthOptionsEnv,
  BackgroundTaskRunner,
} from "../types";

export async function sendAuthEmail(
  sender: AuthEmailSender,
  message: AuthEmailMessage,
  runner?: BackgroundTaskRunner,
): Promise<void> {
  const task = sender.send(message);
  if (runner) {
    // TODO(email-observability): backgrounding with waitUntil is the correct
    // default for verification/password-reset — the auth flow must not block on,
    // or be failed by, a third-party send (latency + enumeration safety). The gap
    // is observability: a Resend dispatch rejection here is currently dropped on
    // the floor (Better Auth only logger.error's inside runInBackgroundOrAwait,
    // and we never attach a .catch). Before/with the email-templating work, route
    // failures to logs + an audit/delivery record (idAdminActivityLog) so an
    // operator can see "verification email to X failed: domain not verified".
    // The awaited branch below is the interactive contract (admin-OTP, test-send)
    // where the caller IS waiting and the error must propagate. Do NOT "fix" this
    // by making production sends synchronous.
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
