import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";

import {
  chatRequestSchema,
  type ApiErrorResponse
} from "@/lib/contracts";
import { analyzeDataset } from "@/server/agent";
import { mapApiError } from "@/server/api-errors";
import { chatWithDataset } from "@/server/chat";
import { consumeRateLimit } from "@/server/rate-limit";
import { validateFileSignature } from "@/server/security";
import { closeDatasetSession } from "@/server/sessions";

const app = new Hono();
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const acceptedExtensions = [".csv", ".xlsx"];
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  "*",
  cors({
    origin: (origin) =>
      allowedOrigins.includes(origin) ? origin : undefined,
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400
  })
);

app.use("/analyze", async (context, next) => {
  const forwardedFor = context.req.header("x-forwarded-for");
  const clientKey =
    forwardedFor?.split(",")[0]?.trim() ||
    context.req.header("x-real-ip") ||
    "local-client";
  const rateLimit = consumeRateLimit({ key: clientKey });

  context.header("X-RateLimit-Remaining", String(rateLimit.remaining));

  if (!rateLimit.allowed) {
    context.header("Retry-After", String(rateLimit.retryAfterSeconds));
    return context.json<ApiErrorResponse>(
      {
        error: "Слишком много запусков анализа. Повторите позже.",
        code: "RATE_LIMITED"
      },
      429
    );
  }

  await next();
});

app.use("/chat", async (context, next) => {
  const forwardedFor = context.req.header("x-forwarded-for");
  const clientKey = `${
    forwardedFor?.split(",")[0]?.trim() ||
    context.req.header("x-real-ip") ||
    "local-client"
  }:chat`;
  const rateLimit = consumeRateLimit({
    key: clientKey,
    maxRequests: 20
  });

  context.header("X-RateLimit-Remaining", String(rateLimit.remaining));

  if (!rateLimit.allowed) {
    context.header("Retry-After", String(rateLimit.retryAfterSeconds));
    return context.json<ApiErrorResponse>(
      {
        error:
          "Слишком много сообщений. Подождите минуту и продолжите диалог.",
        code: "RATE_LIMITED",
        provider: "server",
        retryAfterSeconds: rateLimit.retryAfterSeconds
      },
      429
    );
  }

  await next();
});

app.get("/health", (context) =>
  context.json({
    ok: true,
    service: "razbor-agent-api",
    model: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",
    configured: Boolean(
      process.env.GEMINI_API_KEY && process.env.E2B_API_KEY
    )
  })
);

app.post(
  "/analyze",
  bodyLimit({
    maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
    onError: (context) =>
      context.json<ApiErrorResponse>(
        {
          error: "Файл превышает лимит 10 МБ.",
          code: "FILE_TOO_LARGE"
        },
        413
      )
  }),
  async (context) => {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const e2bApiKey = process.env.E2B_API_KEY;

    if (!geminiApiKey || !e2bApiKey) {
      return context.json<ApiErrorResponse>(
        {
          error:
            "Backend не настроен. Добавьте GEMINI_API_KEY и E2B_API_KEY.",
          code: "NOT_CONFIGURED"
        },
        503
      );
    }

    const form = await context.req.formData();
    const file = form.get("file");
    const instructions = form.get("instructions");

    if (!(file instanceof File)) {
      return context.json<ApiErrorResponse>(
        {
          error: "Добавьте CSV или XLSX файл.",
          code: "BAD_REQUEST"
        },
        400
      );
    }

    const extension = file.name
      .toLowerCase()
      .slice(file.name.lastIndexOf("."));

    if (!acceptedExtensions.includes(extension)) {
      return context.json<ApiErrorResponse>(
        {
          error: "Поддерживаются только файлы CSV и XLSX.",
          code: "UNSUPPORTED_FILE"
        },
        415
      );
    }

    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      return context.json<ApiErrorResponse>(
        {
          error:
            file.size === 0
              ? "Загруженный файл пуст."
              : "Файл превышает лимит 10 МБ.",
          code: file.size === 0 ? "BAD_REQUEST" : "FILE_TOO_LARGE"
        },
        file.size === 0 ? 400 : 413
      );
    }

    const signature = new Uint8Array(
      await file.slice(0, 4_096).arrayBuffer()
    );
    if (
      !validateFileSignature(
        signature,
        extension === ".xlsx" ? ".xlsx" : ".csv"
      )
    ) {
      return context.json<ApiErrorResponse>(
        {
          error: "Содержимое файла не соответствует расширению.",
          code: "UNSUPPORTED_FILE"
        },
        415
      );
    }

    try {
      const result = await analyzeDataset({
        file,
        context: instructions,
        geminiApiKey,
        e2bApiKey,
        model: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite"
      });

      return context.json(result);
    } catch (error) {
      console.error("Analysis failed", error);
      const mapped = mapApiError(error);
      if (mapped.body.retryAfterSeconds) {
        context.header(
          "Retry-After",
          String(mapped.body.retryAfterSeconds)
        );
      }
      return context.json(mapped.body, mapped.status);
    }
  }
);

app.post(
  "/chat",
  bodyLimit({
    maxSize: 16 * 1024,
    onError: (context) =>
      context.json<ApiErrorResponse>(
        {
          error: "Сообщение слишком большое.",
          code: "BAD_REQUEST",
          provider: "server"
        },
        413
      )
  }),
  async (context) => {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return context.json<ApiErrorResponse>(
        {
          error: "Backend не настроен. Добавьте GEMINI_API_KEY.",
          code: "NOT_CONFIGURED",
          provider: "server"
        },
        503
      );
    }

    let payload: unknown;
    try {
      payload = await context.req.json();
    } catch {
      return context.json<ApiErrorResponse>(
        {
          error: "Передайте sessionId и текст сообщения в JSON.",
          code: "BAD_REQUEST",
          provider: "server"
        },
        400
      );
    }

    const parsed = chatRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return context.json<ApiErrorResponse>(
        {
          error:
            "Сессия или текст сообщения имеют неверный формат.",
          code: "BAD_REQUEST",
          provider: "server"
        },
        400
      );
    }

    try {
      const result = await chatWithDataset({
        sessionId: parsed.data.sessionId,
        question: parsed.data.message,
        geminiApiKey
      });
      return context.json(result);
    } catch (error) {
      console.error("Chat failed", error);
      const mapped = mapApiError(error);
      if (mapped.body.retryAfterSeconds) {
        context.header(
          "Retry-After",
          String(mapped.body.retryAfterSeconds)
        );
      }
      return context.json(mapped.body, mapped.status);
    }
  }
);

app.delete("/sessions/:sessionId", async (context) => {
  await closeDatasetSession(context.req.param("sessionId"));
  return context.body(null, 204);
});

app.notFound((context) =>
  context.json<ApiErrorResponse>(
    {
      error: "Маршрут не найден.",
      code: "BAD_REQUEST"
    },
    404
  )
);

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Razbor API is listening on http://localhost:${port}`);
});
