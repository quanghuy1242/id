// DaisyUI 5: https://daisyui.com/components/badge/
import type { ReactNode } from "react";

type BadgeTone = "neutral" | "primary" | "secondary" | "accent" | "success" | "warning" | "error" | "info";

type BadgeProps = {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
};

const badgeClass: Record<BadgeTone, string> = {
  neutral: "badge-neutral",
  primary: "badge-primary",
  secondary: "badge-secondary",
  accent: "badge-accent",
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
  info: "badge-info",
};

export function Badge({ tone = "neutral", children }: BadgeProps) {
  return <span className={`badge badge-sm badge-outline ${badgeClass[tone]}`}>{children}</span>;
}
