import type { ReactNode } from "react";

type SurfaceProps = {
  readonly children: ReactNode;
};

type PageProps = SurfaceProps & {
  readonly layout?: "centered" | "dashboard";
};

export function Page({ layout = "centered", children }: PageProps) {
  if (layout === "centered") {
    return (
      <main className="min-h-screen bg-base-200 text-base-content font-sans flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md flex flex-col gap-4">
          {children}
        </div>
      </main>
    );
  }

  // Dashboard / standard page layout
  return (
    <main className="min-h-screen bg-base-200 text-base-content font-sans flex flex-col">
      {children}
    </main>
  );
}

export function PageHeader({ children }: SurfaceProps) {
  return (
    <header className="border-b border-base-300 bg-base-100 px-6 py-4 w-full">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {children}
      </div>
    </header>
  );
}

export function PageBody({ children }: SurfaceProps) {
  return (
    <div className="flex-1 p-6 w-full max-w-7xl mx-auto">
      {children}
    </div>
  );
}

export function Panel({ children }: SurfaceProps) {
  return (
    <section className="card bg-base-100 border border-base-300 shadow-sm p-6 w-full">
      {children}
    </section>
  );
}

export function Stack({ children }: SurfaceProps) {
  return (
    <div className="flex flex-col gap-4 w-full">
      {children}
    </div>
  );
}
