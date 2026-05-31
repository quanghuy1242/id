import type { AccountOrganization } from "../_actions/account";

export function dateLabel(value: number | null | undefined): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function shortDateLabel(value: number | null | undefined): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

export function roleLabel(role: AccountOrganization["role"]): string {
  if (role === "platform-admin") return "Platform admin";
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

export function roleTone(role: AccountOrganization["role"]): "primary" | "secondary" | "accent" | "neutral" {
  if (role === "platform-admin") return "primary";
  if (role === "owner") return "accent";
  if (role === "admin") return "secondary";
  return "neutral";
}

