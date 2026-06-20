import { beforeEach, describe, expect, it } from "vitest";

import {
  consumeRateLimit,
  resetRateLimitsForTests
} from "@/server/rate-limit";

describe("consumeRateLimit", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  it("blocks requests after the configured quota", () => {
    const first = consumeRateLimit({
      key: "client",
      maxRequests: 2,
      windowMs: 1_000,
      now: 100
    });
    const second = consumeRateLimit({
      key: "client",
      maxRequests: 2,
      windowMs: 1_000,
      now: 200
    });
    const third = consumeRateLimit({
      key: "client",
      maxRequests: 2,
      windowMs: 1_000,
      now: 300
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBe(1);
  });

  it("opens a fresh bucket after the window", () => {
    consumeRateLimit({
      key: "client",
      maxRequests: 1,
      windowMs: 100,
      now: 100
    });

    expect(
      consumeRateLimit({
        key: "client",
        maxRequests: 1,
        windowMs: 100,
        now: 201
      }).allowed
    ).toBe(true);
  });
});
