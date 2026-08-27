import { z } from "zod";

export const collections = [
  "bukhari",
  "muslim",
  "nawawi40",
  "riyadussalihin",
] as const;

const limit = (defaultValue: number, maximum: number) =>
  z
    .string()
    .optional()
    .default(String(defaultValue))
    .transform((value) => Number.parseInt(value, 10))
    .pipe(
      z
        .number()
        .int()
        .min(1, "Limit must be at least 1")
        .max(maximum, `Limit cannot exceed ${maximum}`)
    );

export const quranSearchSchema = z.object({
  q: z
    .string()
    .min(1, "Query cannot be empty")
    .max(500, "Query too long (max 500 characters)"),
  limit: limit(7, 20),
  language: z.enum(["en", "sk"]).optional().default("en"),
});

export const hadithSearchSchema = z.object({
  q: z
    .string()
    .min(1, "Query cannot be empty")
    .max(500, "Query too long (max 500 characters)"),
  collections: z
    .string()
    .optional()
    .transform((value) =>
      value ? value.split(",").map((item) => item.trim()) : undefined
    )
    .pipe(
      z
        .array(
          z.enum(collections, {
            errorMap: () => ({
              message:
                "Invalid collection. Allowed: bukhari, muslim, nawawi40, riyadussalihin",
            }),
          })
        )
        .optional()
    ),
  grade: z
    .enum(["sahih-only", "sahih-and-hasan", "all"])
    .optional()
    .default("sahih-only"),
  limit: limit(5, 15),
});

export function parseQuery<T extends z.ZodTypeAny>(url: URL, schema: T) {
  const result = schema.safeParse(Object.fromEntries(url.searchParams));

  if (result.success) {
    return result;
  }

  const issue = result.error.issues[0];
  return {
    success: false as const,
    error: {
      error: "Validation error",
      message: issue?.message ?? "Invalid query parameters",
      field: issue?.path.join(".") ?? "",
      details: result.error.issues.map((item) => ({
        field: item.path.join("."),
        message: item.message,
        code: item.code,
      })),
    },
  };
}
