import type { ReactNode } from "react";

type InlineProps = {
  readonly gap?: string;
  readonly children: ReactNode;
};

export function Inline({ gap = "8px", children }: InlineProps) {
  return (
    <div className="flex flex-row items-center flex-wrap" style={{ gap }}>
      {children}
    </div>
  );
}
