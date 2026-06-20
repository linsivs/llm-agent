import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activeSessionCountForTests,
  appendSessionMessage,
  cleanupExpiredSessions,
  createDatasetSession,
  getDatasetSession,
  resetSessionsForTests,
  SESSION_TTL_MS,
  SessionExpiredError
} from "@/server/sessions";

function fakeSandbox() {
  return {
    kill: vi.fn().mockResolvedValue(true),
    setTimeout: vi.fn().mockResolvedValue(undefined)
  };
}

const report = {
  title: "Отчет",
  summary: "Краткий вывод.",
  metrics: [
    { label: "Строки", value: "20", interpretation: "Размер датасета." },
    { label: "Колонки", value: "4", interpretation: "Число признаков." }
  ],
  insights: [
    { title: "Рост", evidence: "Показатель вырос.", importance: "high" as const },
    {
      title: "Сезонность",
      evidence: "Есть повторяющийся пик.",
      importance: "medium" as const
    }
  ],
  risks: [],
  methodology: ["Проверены типы данных."]
};

describe("dataset sessions", () => {
  afterEach(async () => {
    await resetSessionsForTests();
  });

  it("creates, refreshes and expires a dataset session", async () => {
    const sandbox = fakeSandbox();
    const session = await createDatasetSession({
      sandbox: sandbox as never,
      datasetPath: "/home/oai/share/dataset.csv",
      fileName: "dataset.csv",
      model: "gemini-test",
      report,
      now: 1_000
    });

    const refreshed = await getDatasetSession(session.id, 2_000);
    expect(refreshed.expiresAt).toBe(2_000 + SESSION_TTL_MS);
    expect(sandbox.setTimeout).toHaveBeenCalled();

    await cleanupExpiredSessions(2_000 + SESSION_TTL_MS + 1);
    expect(activeSessionCountForTests()).toBe(0);
    expect(sandbox.kill).toHaveBeenCalled();
    await expect(
      getDatasetSession(session.id, 2_000 + SESSION_TTL_MS + 2)
    ).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("keeps only the latest chat messages", async () => {
    const session = await createDatasetSession({
      sandbox: fakeSandbox() as never,
      datasetPath: "/home/oai/share/dataset.csv",
      fileName: "dataset.csv",
      model: "gemini-test",
      report
    });

    for (let index = 0; index < 20; index += 1) {
      appendSessionMessage(session, {
        id: String(index),
        role: index % 2 === 0 ? "user" : "assistant",
        content: `message-${index}`,
        createdAt: new Date().toISOString()
      });
    }

    expect(session.history).toHaveLength(16);
    expect(session.history[0]?.content).toBe("message-4");
  });
});
