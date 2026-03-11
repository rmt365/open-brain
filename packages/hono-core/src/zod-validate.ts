import type { ZodSchema } from "zod";
import { zValidator } from "@hono/zod-validator";

/**
 * Validates JSON request body against a Zod schema.
 * Returns 400 with structured error on validation failure.
 */
export function validateJson<T extends ZodSchema>(schema: T) {
  // deno-lint-ignore no-explicit-any
  return zValidator("json", schema as any, (result: any, c: any) => {
    if (!result.success) {
      return c.json(
        {
          error: "Invalid request body",
          code: "VALIDATION_ERROR",
          issues: result.error.issues.map((issue: { path: (string | number)[]; message: string; code: string }) => ({
            path: issue.path.join("."),
            message: issue.message,
            code: issue.code,
          })),
        },
        400
      );
    }
  });
}
