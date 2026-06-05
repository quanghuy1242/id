// This file deliberately imports from workers/ui/ to trigger architecture/worker-isolation
// @ts-expect-error lint fixture intentionally points at a forbidden/missing worker path.
import { AppShell } from "../../../ui/src/app-shell";

export function broken() {
  return AppShell;
}
