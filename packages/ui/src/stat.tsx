// DaisyUI 5: https://daisyui.com/components/stat/
import type { ReactNode } from "react";
import { NavIcon } from "./nav-icons";

export type StatTone = "neutral" | "primary" | "success" | "warning" | "error" | "info";
export type StatColumns = "auto" | 2 | 3 | 4;
export type StatGroupLayout = "grid" | "inline";

const columnsClass: Record<string, string> = {
  auto: "grid-cols-2 lg:grid-cols-4",
  "2": "grid-cols-1 sm:grid-cols-2",
  "3": "grid-cols-1 sm:grid-cols-3",
  "4": "grid-cols-2 lg:grid-cols-4",
};

const toneClass: Record<StatTone, string> = {
  neutral: "text-base-content",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  info: "text-info",
};

type StatGroupProps = {
  readonly children: ReactNode;
  readonly columns?: StatColumns;
  readonly layout?: StatGroupLayout;
};

export function StatGroup({ children, columns = "auto", layout = "grid" }: StatGroupProps) {
  if (layout === "inline") {
    return (
      <div className="stats stats-horizontal w-fit max-w-full self-start border border-base-300 bg-base-100 shadow-none [&_.stat]:min-w-32 [&_.stat]:px-4 [&_.stat]:py-3 [&_.stat-value]:text-xl">
        {children}
      </div>
    );
  }

  return (
    <div
      className={`grid ${columnsClass[String(columns)]} gap-px overflow-hidden rounded-box border border-base-300 bg-base-300`}
    >
      {children}
    </div>
  );
}

type StatProps = {
  readonly title: ReactNode;
  readonly value: ReactNode;
  readonly description?: ReactNode;
  readonly tone?: StatTone;
  readonly iconName?: string;
  readonly meter?: { readonly value: number; readonly max: number };
};

export function Stat({ title, value, description, tone = "neutral", iconName, meter }: StatProps) {
  return (
    <div className="stat bg-base-100">
      {iconName ? (
        <div className={`stat-figure ${toneClass[tone]}`}>
          <NavIcon name={iconName} />
        </div>
      ) : null}
      <div className="stat-title text-base-content/60">{title}</div>
      <div className={`stat-value text-2xl ${toneClass[tone]}`}>{value}</div>
      {description ? <div className="stat-desc text-base-content/50">{description}</div> : null}
      {meter ? (
        <meter
          aria-label={typeof title === "string" ? title : "meter"}
          className="mt-2 block h-2 w-full"
          value={meter.value}
          min={0}
          max={meter.max}
        />
      ) : null}
    </div>
  );
}
