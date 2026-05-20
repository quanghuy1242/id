import type { ReactNode } from "react";

type Gap = "xs" | "sm" | "md" | "lg";
type Width = "narrow" | "content" | "wide" | "full";
type Padding = "none" | "sm" | "md" | "lg";
type SurfaceTone = "base" | "muted";

type SurfaceProps = {
  readonly children: ReactNode;
};

type PageProps = SurfaceProps & {
  readonly layout?: "centered" | "dashboard";
};

const gapClass: Record<Gap, string> = {
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
};

const widthClass: Record<Width, string> = {
  narrow: "max-w-md",
  content: "max-w-3xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};

const paddingClass: Record<Padding, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-6",
  lg: "p-8",
};

export function Page({ layout = "centered", children }: PageProps) {
  if (layout === "centered") {
    return (
      <main className="min-h-screen bg-base-200 text-base-content font-sans flex flex-col items-center justify-center p-4">
        <Container width="narrow">
          <Stack>
            {children}
          </Stack>
        </Container>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-base-200 text-base-content font-sans flex flex-col">
      {children}
    </main>
  );
}

type ContainerProps = SurfaceProps & {
  readonly width?: Width;
};

export function Container({ width = "wide", children }: ContainerProps) {
  return (
    <div className={`w-full ${widthClass[width]} mx-auto`}>
      {children}
    </div>
  );
}

type PageSectionProps = SurfaceProps & {
  readonly padding?: Padding;
};

export function PageSection({ padding = "md", children }: PageSectionProps) {
  return (
    <section className={`w-full ${paddingClass[padding]}`}>
      <Container>{children}</Container>
    </section>
  );
}

export function PageHeader({ children }: SurfaceProps) {
  return (
    <header className="border-b border-base-300 bg-base-100 px-6 py-4 w-full">
      <Container>
        <div className="flex items-center justify-between">
          {children}
        </div>
      </Container>
    </header>
  );
}

export function PageBody({ children }: SurfaceProps) {
  return (
    <div className="flex-1 p-6 w-full">
      <Container>{children}</Container>
    </div>
  );
}

type PanelProps = SurfaceProps & {
  readonly tone?: SurfaceTone;
  readonly padding?: Padding;
};

export function Panel({ tone = "base", padding = "md", children }: PanelProps) {
  const toneClass = tone === "muted" ? "bg-base-200" : "bg-base-100";
  return (
    <section className={`card ${toneClass} border border-base-300 shadow-sm ${paddingClass[padding]} w-full`}>
      {children}
    </section>
  );
}

type StackProps = SurfaceProps & {
  readonly gap?: Gap;
};

export function Stack({ gap = "md", children }: StackProps) {
  return (
    <div className={`flex flex-col ${gapClass[gap]} w-full`}>
      {children}
    </div>
  );
}

type GridProps = SurfaceProps & {
  readonly columns?: "one" | "two" | "three";
  readonly gap?: Gap;
};

export function Grid({ columns = "one", gap = "md", children }: GridProps) {
  const columnsClass = {
    one: "grid-cols-1",
    two: "grid-cols-1 md:grid-cols-2",
    three: "grid-cols-1 md:grid-cols-3",
  }[columns];
  return <div className={`grid ${columnsClass} ${gapClass[gap]}`}>{children}</div>;
}

type ColumnsProps = SurfaceProps & {
  readonly gap?: Gap;
};

export function Columns({ gap = "md", children }: ColumnsProps) {
  return <div className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] ${gapClass[gap]}`}>{children}</div>;
}

type SpacerProps = {
  readonly size?: Gap;
};

export function Spacer({ size = "md" }: SpacerProps) {
  const sizeClass = {
    xs: "h-1",
    sm: "h-2",
    md: "h-4",
    lg: "h-6",
  }[size];
  return <div aria-hidden="true" className={sizeClass} />;
}

export function AppShell({ children }: SurfaceProps) {
  return <div className="min-h-screen bg-base-200 text-base-content">{children}</div>;
}

export function Topbar({ children }: SurfaceProps) {
  return <header className="navbar min-h-14 bg-base-100 border-b border-base-300 px-4">{children}</header>;
}

export function Sidebar({ children }: SurfaceProps) {
  return <nav className="menu menu-sm w-64 bg-base-100 border-r border-base-300 p-3">{children}</nav>;
}

export function MobileDock({ children }: SurfaceProps) {
  return <nav className="dock dock-sm lg:hidden">{children}</nav>;
}
