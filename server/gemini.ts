const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export type GeminiPart = {
  text?: string;
  thoughtSignature?: string;
  functionCall?: {
    name: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
};

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: GeminiContent;
    finishReason?: string;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export class GeminiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "GeminiRequestError";
  }
}

const tools = [
  {
    functionDeclarations: [
      {
        name: "run_python",
        description:
          "Execute Python in the isolated E2B interpreter. Use pandas to inspect and analyze the dataset. Use matplotlib or seaborn and plt.show() when a chart is useful.",
        parameters: {
          type: "OBJECT",
          properties: {
            purpose: {
              type: "STRING",
              description:
                "Short Russian explanation of what this execution checks."
            },
            code: {
              type: "STRING",
              description:
                "Complete Python code. The dataset path is available in DATASET_PATH."
            }
          },
          required: ["purpose", "code"]
        }
      },
      {
        name: "submit_report",
        description:
          "Submit the final evidence-based report after at least two successful Python executions.",
        parameters: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            summary: { type: "STRING" },
            metrics: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  label: { type: "STRING" },
                  value: { type: "STRING" },
                  interpretation: { type: "STRING" }
                },
                required: ["label", "value", "interpretation"]
              }
            },
            insights: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING" },
                  evidence: { type: "STRING" },
                  importance: {
                    type: "STRING",
                    enum: ["high", "medium", "low"]
                  }
                },
                required: ["title", "evidence", "importance"]
              }
            },
            risks: {
              type: "ARRAY",
              items: { type: "STRING" }
            },
            methodology: {
              type: "ARRAY",
              items: { type: "STRING" }
            }
          },
          required: [
            "title",
            "summary",
            "metrics",
            "insights",
            "risks",
            "methodology"
          ]
        }
      }
    ]
  }
];

export async function generateAgentTurn({
  apiKey,
  model,
  systemInstruction,
  contents
}: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  contents: GeminiContent[];
}): Promise<GeminiContent> {
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
  let lastError: GeminiRequestError | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        contents,
        tools,
        toolConfig: {
          functionCallingConfig: {
            mode: "AUTO"
          }
        },
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: 2_048
        }
      })
    });

    const payload = (await response.json()) as GeminiResponse;

    if (response.ok) {
      const content = payload.candidates?.[0]?.content;
      if (!content?.parts?.length) {
        throw new GeminiRequestError(
          "Gemini вернула пустой ответ.",
          response.status,
          false
        );
      }
      return content;
    }

    const retryable = response.status === 429 || response.status >= 500;
    lastError = new GeminiRequestError(
      payload.error?.message ?? `Gemini API вернула HTTP ${response.status}.`,
      response.status,
      retryable
    );

    if (!retryable || attempt === 2) {
      throw lastError;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 800 * Math.pow(2, attempt))
    );
  }

  throw lastError ?? new GeminiRequestError("Gemini API недоступна.", 500, true);
}

