import type { AuthEmailMessage, AuthEmailSender } from "../../src/auth/types";

export type CapturedAuthEmailSender = AuthEmailSender & {
  readonly messages: readonly AuthEmailMessage[];
};

export function createCapturedAuthEmailSender(): CapturedAuthEmailSender {
  const messages: AuthEmailMessage[] = [];
  return {
    messages,
    send: async (message) => {
      messages.push(message);
    },
  };
}
