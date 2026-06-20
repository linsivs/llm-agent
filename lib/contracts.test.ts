import { describe, expect, it } from "vitest";

import { chatHistorySchema, reportSchema } from "@/lib/contracts";

describe("reportSchema", () => {
  it("accepts a complete evidence-based report", () => {
    const result = reportSchema.safeParse({
      title: "Продажи по регионам",
      summary: "Основной рост обеспечил восточный регион.",
      metrics: [
        {
          label: "Выручка",
          value: "1,24 млн ₽",
          interpretation: "Сумма по всем строкам после очистки."
        },
        {
          label: "Заказы",
          value: "482",
          interpretation: "Количество уникальных заказов."
        }
      ],
      insights: [
        {
          title: "Рост на востоке",
          evidence: "Выручка региона выросла на 18,4%.",
          importance: "high"
        },
        {
          title: "Сезонность",
          evidence: "Пик наблюдается в декабре.",
          importance: "medium"
        }
      ],
      risks: ["В 3,1% строк отсутствует регион."],
      methodology: ["Проверены типы, пропуски и дубликаты."]
    });

    expect(result.success).toBe(true);
  });
});

describe("chatHistorySchema", () => {
  it("accepts a bounded user-assistant conversation", () => {
    const result = chatHistorySchema.safeParse([
      { role: "user", content: "Сравни регионы" },
      { role: "assistant", content: "Восток растет быстрее." }
    ]);

    expect(result.success).toBe(true);
  });

  it("rejects oversized chat history", () => {
    const result = chatHistorySchema.safeParse(
      Array.from({ length: 17 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `Сообщение ${index}`
      }))
    );

    expect(result.success).toBe(false);
  });
});
