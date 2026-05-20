import type { AuthEmailMessage } from "../types";

const htmlEscapes = [
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&#39;"],
] as const;

export type RenderedAuthEmail = {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};

function escapeHtml(value: string): string {
  return htmlEscapes.reduce((escaped, [search, replacement]) => escaped.replaceAll(search, replacement), value);
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
