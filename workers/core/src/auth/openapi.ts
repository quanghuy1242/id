import { z } from "zod";

export interface BetterAuthFieldDef {
  type: "string" | "number" | "boolean" | "date" | "string[]";
  required?: boolean;
  unique?: boolean;
  index?: boolean;
  defaultValue?:
    | string
    | number
    | boolean
    | Date
    | (() => string | number | boolean | Date);
  references?: { model: string; field: string };
}

type BetterAuthMeta = Partial<
  Pick<BetterAuthFieldDef, "index" | "unique" | "references">
>;

function analyzeZodField(schema: z.ZodTypeAny): {
  type: BetterAuthFieldDef["type"];
  required: boolean;
  defaultValue?: unknown;
} {
  let current = schema;
  let hasOptional = false;
  let hasNullable = false;
  let hasDefault = false;
  let defaultValue: unknown = undefined;
  let baseType: BetterAuthFieldDef["type"] | undefined;

  while (true) {
    if (current instanceof z.ZodOptional) {
      hasOptional = true;
      current = current.unwrap() as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodNullable) {
      hasNullable = true;
      current = current.unwrap() as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodDefault) {
      hasDefault = true;
      defaultValue = current.parse(undefined);
      current = current.unwrap() as z.ZodTypeAny;
      continue;
    }

    if (current instanceof z.ZodString || current instanceof z.ZodURL)
      baseType = "string";
    if (current instanceof z.ZodNumber) baseType = "number";
    if (current instanceof z.ZodBoolean) baseType = "boolean";
    if (current instanceof z.ZodDate) baseType = "date";
    if (current instanceof z.ZodArray) baseType = "string[]";
    if (baseType !== undefined) break;
    throw new TypeError(
      `Unsupported schema field type: ${current.constructor.name}`,
    );
  }

  const required = hasDefault || !(hasOptional || hasNullable);

  return {
    type: baseType,
    required,
    defaultValue: hasDefault ? defaultValue : undefined,
  };
}

export function mapZodToBetterAuthFields(
  zodSchema: z.ZodObject<z.ZodRawShape>,
): Record<string, BetterAuthFieldDef> {
  const fields: Record<string, BetterAuthFieldDef> = {};

  for (const [key, value] of Object.entries(zodSchema.shape)) {
    if (key === "id") continue;

    const { type, required, defaultValue } = analyzeZodField(
      value as z.ZodTypeAny,
    );
    const typedValue = value as { meta?: unknown };
    const meta =
      typeof typedValue.meta === "function"
        ? (typedValue.meta as () => { betterAuth?: BetterAuthMeta })()
            ?.betterAuth
        : undefined;

    fields[key] = {
      type,
      required,
      ...(defaultValue !== undefined
        ? { defaultValue: defaultValue as BetterAuthFieldDef["defaultValue"] }
        : {}),
      ...meta,
    };
  }

  return fields;
}

function stripInternalOpenApiMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInternalOpenApiMetadata);
  if (!value || typeof value !== "object") return value;
  const cleaned: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "betterAuth" || key === "$schema") continue;
    cleaned[key] = stripInternalOpenApiMetadata(child);
  }
  return cleaned;
}

export function zodSchemaToOpenApi(
  schema: z.ZodTypeAny,
): Record<string, unknown> {
  return stripInternalOpenApiMetadata(z.toJSONSchema(schema)) as Record<
    string,
    unknown
  >;
}

export type OpenApiJsonContent = {
  "application/json": {
    schema: Record<string, unknown>;
  };
};

export type OpenApiRequestBody = {
  required: boolean;
  content: OpenApiJsonContent;
};

export function openApiJsonRequestBody(
  schema: z.ZodTypeAny,
): OpenApiRequestBody {
  return {
    required: true,
    content: {
      "application/json": {
        schema: zodSchemaToOpenApi(schema),
      },
    },
  };
}
