// This file deliberately imports from workers/ui/ to trigger architecture/worker-isolation
import { AppShell } from "../../../ui/src/app-shell";

export function broken() {
  return AppShell;
}
