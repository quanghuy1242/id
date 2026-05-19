/** Query and JSON field names that must never be emitted to logs. */
export const SENSITIVE_LOG_FIELDS = [
  "access_token",
  "authorization",
  "code",
  "client_secret",
  "id_token",
  "refresh_token",
  "token",
];

/** Replacement used for redacted log fields. */
export const REDACTED_LOG_VALUE = "[redacted]";

export type StructuredLogRecord = {
  readonly event: string;
  readonly fields: Readonly<Record<string, unknown>>;
};

function redactValue(key: string, value: unknown): unknown {
  return SENSITIVE_LOG_FIELDS.includes(key.toLowerCase()) ? REDACTED_LOG_VALUE : value;
}

export function redactLogFields(fields: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, redactValue(key, value)]));
}

export function structuredLog(event: string, fields: Readonly<Record<string, unknown>>): StructuredLogRecord {
  return {
    event,
    fields: redactLogFields(fields),
  };
}

