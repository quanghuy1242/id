import type { ReactNode } from "react";

type TextLevel = "h1" | "h2" | "h3" | "body" | "caption";

type TextProps = {
  readonly level?: TextLevel;
  readonly children: ReactNode;
};

export function Text({ level = "body", children }: TextProps) {
  if (level === "h1") {
    return <h1 className="text-2xl font-bold leading-tight text-base-content m-0">{children}</h1>;
  }
  if (level === "h2") {
    return <h2 className="text-xl font-semibold leading-tight text-base-content m-0">{children}</h2>;
  }
  if (level === "h3") {
    return <h3 className="text-lg font-semibold leading-tight text-base-content m-0">{children}</h3>;
  }
  if (level === "caption") {
    return <p className="text-xs font-normal text-base-content/60 m-0">{children}</p>;
  }
  return <p className="text-sm font-normal leading-relaxed text-base-content/90 m-0">{children}</p>;
}

export function Heading({ level = "h2", children }: TextProps) {
  if (level === "h1") {
    return <h1 className="text-2xl font-bold leading-tight text-base-content m-0">{children}</h1>;
  }
  if (level === "h3") {
    return <h3 className="text-lg font-semibold leading-tight text-base-content m-0">{children}</h3>;
  }
  return <h2 className="text-xl font-semibold leading-tight text-base-content m-0">{children}</h2>;
}
