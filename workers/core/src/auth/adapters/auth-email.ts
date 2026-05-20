export type AuthEmailKind = "password-reset" | "verification";

export type AuthEmailMessage = {
  readonly kind: AuthEmailKind;
  readonly to: string;
  readonly url: string;
};

export type AuthEmailSender = {
  readonly send: (message: AuthEmailMessage) => Promise<void>;
};

export type BackgroundTaskRunner = {
  readonly waitUntil: (task: Promise<unknown>) => void;
};

export type RenderedAuthEmail = {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderAuthEmail(message: AuthEmailMessage): RenderedAuthEmail {
  const label = message.kind === "verification" ? "Verify your email" : "Reset your password";
  const subject = message.kind === "verification" ? "Verify your email for id" : "Reset your id password";
  const action = message.kind === "verification" ? "verify your email" : "reset your password";
  const escapedUrl = escapeHtml(message.url);

  return {
    subject,
    text: [
      `${label}`,
      "",
      `Use this link to ${action}:`,
      message.url,
      "",
      "If you did not request this email, you can ignore it.",
    ].join("\n"),
    html: [
      "<!doctype html>",
      '<html lang="en">',
      "<body>",
      `<p>${escapeHtml(label)}</p>`,
      `<p><a href="${escapedUrl}">Use this link to ${escapeHtml(action)}</a>.</p>`,
      "<p>If you did not request this email, you can ignore it.</p>",
      "</body>",
      "</html>",
    ].join(""),
  };
}

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
