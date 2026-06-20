import type { ApiErrorResponse } from "@/lib/contracts";
import { GeminiRequestError } from "@/server/gemini";

export interface MappedApiError {
  status: 400 | 429 | 500 | 503;
  body: ApiErrorResponse;
}

export function mapApiError(error: unknown): MappedApiError {
  if (error instanceof GeminiRequestError) {
    if (error.status === 429) {
      return {
        status: 429,
        body: {
          error:
            "Бесплатный лимит Gemini временно исчерпан. Подождите минуту и повторите запрос.",
          code: "RATE_LIMITED",
          provider: "gemini",
          retryAfterSeconds: 60
        }
      };
    }

    if (error.retryable) {
      return {
        status: 503,
        body: {
          error:
            "Gemini временно недоступна. Подождите немного и повторите запрос.",
          code: "PROVIDER_BUSY",
          provider: "gemini",
          retryAfterSeconds: 30
        }
      };
    }
  }

  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("e2b") ||
    normalized.includes("sandbox") ||
    normalized.includes("code interpreter")
  ) {
    const limited =
      normalized.includes("429") ||
      normalized.includes("limit") ||
      normalized.includes("quota") ||
      normalized.includes("rate");

    return {
      status: limited ? 429 : 503,
      body: {
        error: limited
          ? "Лимит Python-песочницы временно исчерпан. Подождите минуту и повторите запрос."
          : "Python-песочница временно недоступна. Повторите запрос через минуту.",
        code: limited ? "RATE_LIMITED" : "PROVIDER_BUSY",
        provider: "e2b",
        retryAfterSeconds: 60
      }
    };
  }

  return {
    status: 500,
    body: {
      error: message || "Агент не смог завершить запрос.",
      code: "AGENT_FAILED",
      provider: "server"
    }
  };
}
