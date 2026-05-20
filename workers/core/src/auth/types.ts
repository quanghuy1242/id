import type { BetterAuthOptions } from "better-auth";
import type { BetterAuthKvStorage } from "./adapters/secondary-storage";
import type { CoreEnv } from "../config/env";

export type AuthEmailKind = "password-reset" | "verification";

export type AuthEmailMessage = {
  readonly kind: AuthEmailKind;
  readonly to: string;
  readonly url: string;
};

export type AuthEmailSender = {
  readonly send: (message: AuthEmailMessage) => Promise<void>;
};

export type BackgroundTaskRunner = {
  readonly waitUntil: (task: Promise<unknown>) => void;
};

export type AuthRuntimeOptions = {
  readonly backgroundTaskRunner?: BackgroundTaskRunner;
  readonly emailSender?: AuthEmailSender;
};

export type AuthOptionsEnv = Omit<CoreEnv, "DB" | "KV"> & {
  readonly DB: BetterAuthOptions["database"];
  readonly KV: BetterAuthKvStorage;
};
