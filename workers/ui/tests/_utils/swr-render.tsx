import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { SWRConfig } from "swr";

/**
 * Wraps a render in a fresh SWR cache so each test is isolated: the module
 * singleton never leaks data between tests, and first-mount fetches fire
 * against the test's own mocked actions.
 */
function SwrCacheBoundary({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}>
      {children}
    </SWRConfig>
  );
}

export function renderWithSwr(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: SwrCacheBoundary, ...options });
}
