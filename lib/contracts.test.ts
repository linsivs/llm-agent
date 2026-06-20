import { describe, expect, it } from "vitest";

import { reportSchema } from "@/lib/contracts";

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
