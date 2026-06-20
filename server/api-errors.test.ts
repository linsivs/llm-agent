import { describe, expect, it } from "vitest";

import { mapApiError } from "@/server/api-errors";
import { GeminiRequestError } from "@/server/gemini";

describe("mapApiError", () => {
  it("maps Gemini quota errors to a retryable response", () => {
    const mapped = mapApiError(
      new GeminiRequestError("quota exceeded", 429, true)
    );

    expect(mapped.status).toBe(429);
    expect(mapped.body.code).toBe("RATE_LIMITED");
    expect(mapped.body.provider).toBe("gemini");
    expect(mapped.body.retryAfterSeconds).toBe(60);
  });

  it("maps E2B capacity failures", () => {
    const mapped = mapApiError(new Error("E2B sandbox rate limit 429"));

    expect(mapped.status).toBe(429);
    expect(mapped.body.provider).toBe("e2b");
  });
});
