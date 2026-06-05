import type { AuthRuntimeOptions } from "../auth/types";

export function resolveAuthRuntime(c: {
  executionCtx?: { waitUntil(task: Promise<unknown>): void };
}): AuthRuntimeOptions {
  try {
    const executionCtx = c.executionCtx;
    if (!executionCtx) {
      return {};
    }

    return {
      backgroundTaskRunner: {
        waitUntil: (task) => executionCtx.waitUntil(task),
      },
    };
  } catch {
    return {};
  }
}
