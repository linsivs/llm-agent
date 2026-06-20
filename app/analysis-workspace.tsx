"use client";

import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  ChartBar,
  ChartScatter,
  ChatCircleDots,
  CheckCircle,
  Clock,
  Code,
  Database,
  DownloadSimple,
  FileCsv,
  FileXls,
  Flask,
  Info,
  PaperPlaneTilt,
  Play,
  Robot,
  ShieldCheck,
  Sparkle,
  TerminalWindow,
  UploadSimple,
  Warning,
  X
} from "@phosphor-icons/react";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import type {
  AnalysisResponse,
  ApiErrorResponse,
  ChatMessage,
  ChatResponse
} from "@/lib/contracts";

type ViewState = "idle" | "analyzing" | "success" | "error";
type UiError = Pick<
  ApiErrorResponse,
  "error" | "code" | "provider" | "retryAfterSeconds"
>;
type ChatEntry = ChatMessage & {
  charts?: ChatResponse["charts"];
  trace?: ChatResponse["trace"];
};

class ApiClientError extends Error {
  readonly details: UiError;

  constructor(details: UiError) {
    super(details.error);
    this.name = "ApiClientError";
    this.details = details;
  }
}

const API_URL = (
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8787"
).replace(/\/$/, "");

const progressStages = [
  "Загружаем файл в изолированную среду",
  "Агент исследует структуру и качество",
  "Python считает метрики и строит графики",
  "Gemini проверяет факты и собирает отчет"
];

const chatSuggestions = [
  "Какие строки выглядят аномальными?",
  "Что сильнее всего влияет на результат?",
  "Сравни ключевые группы между собой"
];

const demoResult: AnalysisResponse = {
  report: {
    title: "Продажи: рост держится на двух регионах",
    summary:
      "Выручка выросла, но результат неравномерен. Восток и Центр обеспечили основную часть прироста, а высокая скидка в категории «Офис» снизила средний чек.",
    metrics: [
      {
        label: "Выручка",
        value: "4,82 млн ₽",
        interpretation: "Сумма продаж за весь период после проверки пропусков."
      },
      {
        label: "Заказы",
        value: "1 936",
        interpretation: "Общее количество заказов в 24 наблюдениях."
      },
      {
        label: "Средний чек",
        value: "2 490 ₽",
        interpretation: "Выручка, деленная на число заказов."
      },
      {
        label: "Макс. рост",
        value: "+18,4%",
        interpretation: "Изменение выручки региона Восток к прошлому периоду."
      }
    ],
    insights: [
      {
        title: "Восток стал главным источником роста",
        evidence:
          "На регион приходится 41% общего прироста выручки при росте числа заказов на 13,2%.",
        importance: "high"
      },
      {
        title: "Скидки в категории «Офис» не окупаются",
        evidence:
          "При скидке выше 15% средний чек падает на 11,7%, а число заказов растет только на 3,1%.",
        importance: "high"
      },
      {
        title: "В декабре наблюдается устойчивый пик",
        evidence:
          "Декабрьская выручка выше медианы месяца на 22,6% в обоих представленных годах.",
        importance: "medium"
      }
    ],
    risks: [
      "Наблюдений недостаточно для надежного прогноза на следующий год.",
      "В 2,4% строк отсутствует категория товара.",
      "Причинный эффект скидки нельзя подтвердить без контрольной группы."
    ],
    methodology: [
      "Проверены типы колонок, пропуски, дубликаты и диапазоны значений.",
      "Рассчитаны агрегаты по регионам, категориям и месяцам.",
      "Проверены динамика, сезонность и связь скидки со средним чеком."
    ]
  },
  charts: [],
  trace: [
    {
      step: 1,
      purpose: "Проверка структуры и качества данных",
      code:
        "import pandas as pd\n\ndf = pd.read_csv(DATASET_PATH)\nprint(df.info())\nprint(df.isna().sum())\nprint(df.duplicated().sum())",
      stdout:
        "rows=24, columns=6\nmissing: category=1\nduplicates=0\nnumeric ranges are valid",
      stderr: "",
      durationMs: 1432,
      status: "success"
    },
    {
      step: 2,
      purpose: "Расчет метрик по регионам и категориям",
      code:
        "summary = df.groupby('region').agg({'revenue':'sum','orders':'sum'})\nsummary['avg_order'] = summary.revenue / summary.orders\nprint(summary.round(2))",
      stdout:
        "East revenue_share=0.31 growth=0.184\nCenter revenue_share=0.29 growth=0.121",
      stderr: "",
      durationMs: 908,
      status: "success"
    },
    {
      step: 3,
      purpose: "Проверка сезонности и подготовка графиков",
      code:
        "import matplotlib.pyplot as plt\nmonthly = df.groupby('date').revenue.sum()\nmonthly.plot(kind='line')\nplt.tight_layout()\nplt.show()",
      stdout: "chart_ready=true",
      stderr: "",
      durationMs: 1760,
      status: "success"
    }
  ],
  meta: {
    fileName: "sales-example.csv",
    fileSize: 1847,
    model: "gemini-3.1-flash-lite",
    toolCalls: 4,
    durationMs: 12640
  }
};

export function AnalysisWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultPanelRef = useRef<HTMLElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState("");
  const [viewState, setViewState] = useState<ViewState>("idle");
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [isDemo, setIsDemo] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<UiError | null>(null);

  useEffect(() => {
    if (viewState !== "analyzing") {
      return;
    }

    const timer = window.setInterval(() => {
      setProgressStage((current) =>
        Math.min(current + 1, progressStages.length - 1)
      );
    }, 3_800);

    return () => window.clearInterval(timer);
  }, [viewState]);

  useEffect(() => {
    if (!chatOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !chatBusy) {
        setChatOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [chatBusy, chatOpen]);

  const fileLabel = useMemo(() => {
    if (!file) {
      return null;
    }

    return {
      name: file.name,
      size: formatBytes(file.size),
      kind: file.name.toLowerCase().endsWith(".xlsx") ? "Excel" : "CSV"
    };
  }, [file]);

  function acceptFile(candidate: File | null) {
    if (!candidate) {
      return;
    }

    const lowerName = candidate.name.toLowerCase();
    if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".xlsx")) {
      setError({
        error: "Поддерживаются только CSV и XLSX.",
        code: "UNSUPPORTED_FILE"
      });
      setViewState("error");
      return;
    }

    if (candidate.size > 10 * 1024 * 1024) {
      setError({
        error: "Файл превышает лимит 10 МБ.",
        code: "BAD_REQUEST"
      });
      setViewState("error");
      return;
    }

    if (candidate.size === 0) {
      setError({ error: "Файл пуст.", code: "BAD_REQUEST" });
      setViewState("error");
      return;
    }

    setFile(candidate);
    setError(null);
    if (viewState === "error") {
      setViewState("idle");
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    acceptFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError({ error: "Сначала выберите датасет.", code: "BAD_REQUEST" });
      setViewState("error");
      return;
    }

    setViewState("analyzing");
    setProgressStage(0);
    setError(null);
    setResult(null);
    setIsDemo(false);
    setChatMessages([]);
    setChatError(null);

    const body = new FormData();
    body.append("file", file);
    body.append("instructions", instructions);

    try {
      const response = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        body
      });
      const payload = await readJsonResponse<AnalysisResponse>(response);

      if (!response.ok || isApiError(payload)) {
        throw apiErrorFromPayload(
          payload,
          "Агент не смог завершить анализ."
        );
      }

      setResult(payload);
      setViewState("success");
      revealResult();
    } catch (requestError) {
      setError(toUiError(requestError));
      setViewState("error");
    }
  }

  function showDemo() {
    setResult(demoResult);
    setViewState("success");
    setError(null);
    setIsDemo(true);
    setChatMessages([]);
    setChatError(null);
    revealResult();
  }

  function reset() {
    setFile(null);
    setInstructions("");
    setResult(null);
    setError(null);
    setViewState("idle");
    setProgressStage(0);
    setIsDemo(false);
    setChatOpen(false);
    setChatMessages([]);
    setChatError(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    window.requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  function revealResult() {
    window.requestAnimationFrame(() => {
      if (window.innerWidth <= 980) {
        const resultTop = resultPanelRef.current?.offsetTop;
        if (typeof resultTop === "number") {
          window.scrollTo(0, Math.max(0, resultTop - 8));
        }
        return;
      }
      window.scrollTo(0, 0);
    });
  }

  function openChat() {
    if (!result) {
      return;
    }

    setChatMessages((current) =>
      current.length > 0
        ? current
        : [
            {
              id: "chat-intro",
              role: "assistant",
              content: isDemo
                ? "Это демонстрационный режим интерфейса. Задайте вопрос по отчету — я покажу, как будет выглядеть продолжение анализа."
                : "Отчет готов, а исходный датасет прикреплен к этому диалогу. Задайте уточняющий вопрос — я запущу новый Python-анализ по тому же файлу.",
              createdAt: new Date().toISOString()
            }
          ]
    );
    setChatError(null);
    setChatOpen(true);
  }

  async function sendChatMessage(message: string) {
    if (!result || chatBusy || !message.trim()) {
      return;
    }

    const cleanMessage = message.trim();
    const userMessage: ChatEntry = {
      id: createClientId(),
      role: "user",
      content: cleanMessage,
      createdAt: new Date().toISOString()
    };
    setChatMessages((current) => [...current, userMessage]);
    setChatError(null);
    setChatBusy(true);

    if (isDemo) {
      await new Promise((resolve) => window.setTimeout(resolve, 850));
      setChatMessages((current) => [
        ...current,
        {
          id: createClientId(),
          role: "assistant",
          content:
            "В демо-датасете Восток дает 41% прироста выручки. Чтобы подтвердить устойчивость результата, агент дополнительно сравнил бы распределения среднего чека и заказов по регионам через Python.",
          evidence: [
            "Рост выручки Востока: 18,4%",
            "Рост числа заказов: 13,2%",
            "Режим демо не обращается к API"
          ],
          createdAt: new Date().toISOString()
        }
      ]);
      setChatBusy(false);
      return;
    }

    if (!file) {
      setChatError({
        error:
          "Исходный файл больше недоступен в браузере. Загрузите его повторно.",
        code: "BAD_REQUEST"
      });
      setChatBusy(false);
      return;
    }

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("message", cleanMessage);
      body.append("report", JSON.stringify(result.report));
      body.append(
        "history",
        JSON.stringify(
          chatMessages
            .filter((entry) => entry.id !== "chat-intro")
            .slice(-16)
            .map((entry) => ({
              role: entry.role,
              content: entry.content
            }))
        )
      );

      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        body
      });
      const payload = await readJsonResponse<ChatResponse>(response);

      if (!response.ok || isApiError(payload)) {
        throw apiErrorFromPayload(
          payload,
          "Агент не смог ответить на вопрос."
        );
      }

      setChatMessages((current) => [
        ...current,
        {
          ...payload.message,
          charts: payload.charts,
          trace: payload.trace
        }
      ]);
    } catch (requestError) {
      setChatError(toUiError(requestError));
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <main className="appShell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Разбор, на главную">
          <span className="brandMark" aria-hidden="true">
            <ChartScatter size={22} weight="duotone" />
          </span>
          <span>Разбор</span>
        </a>

        <div className="stackLabel">
          <span>Gemini 3.1 Flash-Lite</span>
          <span>E2B Python</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="controlPanel">
          <div className="intro">
            <p className="kicker">Агентная аналитика</p>
            <h1>Данные входят. Решения выходят.</h1>
            <p>
              LLM сама пишет Python, запускает его в песочнице и проверяет вывод
              перед отчетом.
            </p>
          </div>

          <form className="analysisForm" onSubmit={handleSubmit}>
            <div className="fieldGroup">
              <div className="fieldHeading">
                <label htmlFor="dataset">Датасет</label>
                <span>CSV или XLSX, до 10 МБ</span>
              </div>

              {fileLabel ? (
                <div className="selectedFile">
                  <span className="fileIcon" aria-hidden="true">
                    {fileLabel.kind === "Excel" ? (
                      <FileXls size={24} weight="duotone" />
                    ) : (
                      <FileCsv size={24} weight="duotone" />
                    )}
                  </span>
                  <span className="selectedFileText">
                    <strong>{fileLabel.name}</strong>
                    <small>
                      {fileLabel.kind}, {fileLabel.size}
                    </small>
                  </span>
                  <button
                    className="iconButton"
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (inputRef.current) {
                        inputRef.current.value = "";
                      }
                    }}
                    aria-label="Удалить файл"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <div
                  className={`dropzone ${dragActive ? "isDragging" : ""}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      inputRef.current?.click();
                    }
                  }}
                >
                  <UploadSimple size={28} weight="duotone" />
                  <strong>Перетащите файл сюда</strong>
                  <span>или нажмите, чтобы выбрать</span>
                </div>
              )}

              <input
                ref={inputRef}
                id="dataset"
                className="visuallyHidden"
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
              />
            </div>

            <div className="fieldGroup">
              <div className="fieldHeading">
                <label htmlFor="instructions">Контекст и задача</label>
                <span>{instructions.length}/2000</span>
              </div>
              <textarea
                id="instructions"
                value={instructions}
                maxLength={2_000}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Например: сравни регионы, найди причины падения выручки и проверь влияние скидок."
              />
              <p className="helper">
                Необязательно. Без инструкции агент сам выберет направления
                анализа.
              </p>
            </div>

            <button
              className="primaryButton"
              type="submit"
              disabled={!file || viewState === "analyzing"}
            >
              {viewState === "analyzing" ? (
                <>
                  <Sparkle size={19} weight="fill" />
                  Агент работает
                </>
              ) : (
                <>
                  Запустить анализ
                  <ArrowRight size={19} weight="bold" />
                </>
              )}
            </button>

            <div className="secondaryActions">
              <a href="samples/sales.csv" download>
                <DownloadSimple size={17} />
                Скачать пример
              </a>
              <button type="button" onClick={showDemo}>
                <Play size={17} weight="fill" />
                Показать демо
              </button>
            </div>
          </form>

          <div className="securityNote">
            <ShieldCheck size={20} weight="duotone" />
            <p>
              Файл обрабатывается в одноразовой E2B-песочнице без доступа в
              интернет. Содержимое таблицы считается недоверенным.
            </p>
          </div>
        </aside>

        <section
          ref={resultPanelRef}
          className="resultPanel"
          aria-live="polite"
        >
          {viewState === "idle" && <EmptyState />}
          {viewState === "analyzing" && (
            <LoadingState currentStage={progressStage} />
          )}
          {viewState === "error" && error && (
            <ErrorState error={error} onRetry={() => setViewState("idle")} />
          )}
          {viewState === "success" && result && (
            <ReportView
              result={result}
              isDemo={isDemo}
              onOpenChat={openChat}
              onReset={reset}
            />
          )}
        </section>
      </section>

      {chatOpen && result && (
        <DatasetChat
          result={result}
          entries={chatMessages}
          error={chatError}
          busy={chatBusy}
          isDemo={isDemo}
          onClose={() => setChatOpen(false)}
          onSend={sendChatMessage}
        />
      )}

      <footer className="footer">
        <span>Учебный проект по агентной аналитике данных</span>
        <span>Next.js + Gemini API + E2B</span>
      </footer>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="emptyState">
      <div className="emptyVisual" aria-hidden="true">
        <div className="emptyVisualCore">
          <Database size={46} weight="duotone" />
        </div>
        <span className="orbit orbitOne">
          <Code size={18} />
        </span>
        <span className="orbit orbitTwo">
          <ChartBar size={18} />
        </span>
        <span className="orbit orbitThree">
          <CheckCircle size={18} />
        </span>
      </div>

      <div className="emptyCopy">
        <h2>Отчет появится здесь</h2>
        <p>
          Агент исследует файл последовательно. Каждый вывод можно проверить по
          выполненному Python-коду.
        </p>
      </div>

      <div className="processList">
        <div>
          <Database size={21} weight="duotone" />
          <span>
            <strong>Исследует</strong>
            <small>структуру, типы и качество</small>
          </span>
        </div>
        <div>
          <TerminalWindow size={21} weight="duotone" />
          <span>
            <strong>Вычисляет</strong>
            <small>метрики в Python</small>
          </span>
        </div>
        <div>
          <Flask size={21} weight="duotone" />
          <span>
            <strong>Проверяет</strong>
            <small>гипотезы и аномалии</small>
          </span>
        </div>
      </div>
    </div>
  );
}

function LoadingState({ currentStage }: { currentStage: number }) {
  return (
    <div className="loadingState">
      <div className="agentPulse" aria-hidden="true">
        <Sparkle size={34} weight="fill" />
      </div>
      <div className="loadingCopy">
        <p className="kicker">Анализ выполняется</p>
        <h2>{progressStages[currentStage]}</h2>
        <p>
          Слабая бесплатная модель может сделать несколько итераций. Обычно это
          занимает до минуты.
        </p>
      </div>
      <ol className="progressList">
        {progressStages.map((stage, index) => (
          <li
            key={stage}
            className={
              index < currentStage
                ? "isComplete"
                : index === currentStage
                  ? "isCurrent"
                  : ""
            }
          >
            <span className="progressIndex">
              {index < currentStage ? (
                <CheckCircle size={18} weight="fill" />
              ) : (
                index + 1
              )}
            </span>
            <span>{stage}</span>
          </li>
        ))}
      </ol>
      <div className="skeletonBlock">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function ErrorState({
  error,
  onRetry
}: {
  error: UiError;
  onRetry: () => void;
}) {
  const isTemporary =
    error.code === "RATE_LIMITED" || error.code === "PROVIDER_BUSY";

  return (
    <div className="errorState">
      <span className={`errorIcon ${isTemporary ? "isTemporary" : ""}`}>
        {isTemporary ? (
          <Clock size={34} weight="duotone" />
        ) : (
          <Warning size={34} weight="duotone" />
        )}
      </span>
      <h2>{isTemporary ? "Нужна короткая пауза" : "Анализ остановлен"}</h2>
      <p>{error.error}</p>
      {isTemporary && (
        <span className="retryHint">
          Обычно можно повторить через {error.retryAfterSeconds ?? 60} секунд.
        </span>
      )}
      <button className="secondaryButton" type="button" onClick={onRetry}>
        Вернуться к форме
      </button>
    </div>
  );
}

function ReportView({
  result,
  isDemo,
  onOpenChat,
  onReset
}: {
  result: AnalysisResponse;
  isDemo: boolean;
  onOpenChat: () => void;
  onReset: () => void;
}) {
  return (
    <article className="report">
      <header className="reportHeader">
        <div>
          <p className="kicker">Анализ завершен</p>
          <h2>{result.report.title}</h2>
          <p>{result.report.summary}</p>
        </div>
        <button className="secondaryButton" type="button" onClick={onReset}>
          Новый анализ
        </button>
      </header>

      <div className="reportMeta">
        <span>{result.meta.fileName}</span>
        <span>{formatBytes(result.meta.fileSize)}</span>
        <span>{result.meta.toolCalls} вызова инструментов</span>
        <span>{formatDuration(result.meta.durationMs)}</span>
      </div>

      <section className="metricsSection" aria-labelledby="metrics-title">
        <h3 id="metrics-title">Ключевые метрики</h3>
        <div className="metricsGrid">
          {result.report.metrics.map((metric) => (
            <div className="metric" key={`${metric.label}-${metric.value}`}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.interpretation}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="insightsSection" aria-labelledby="insights-title">
        <h3 id="insights-title">Что важно</h3>
        <div className="insightsList">
          {result.report.insights.map((insight, index) => (
            <article className="insight" key={`${insight.title}-${index}`}>
              <span className={`importance ${insight.importance}`}>
                {importanceLabel(insight.importance)}
              </span>
              <div>
                <h4>{insight.title}</h4>
                <p>{insight.evidence}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {result.charts.length > 0 && (
        <section className="chartsSection" aria-labelledby="charts-title">
          <h3 id="charts-title">Графики агента</h3>
          <div className="chartsGrid">
            {result.charts.map((chart) => (
              <figure key={chart.id}>
                <Image
                  src={`data:${chart.mimeType};base64,${chart.data}`}
                  width={1200}
                  height={720}
                  unoptimized
                  alt={chart.caption}
                />
                <figcaption>{chart.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <div className="reportSplit">
        <section aria-labelledby="risks-title">
          <h3 id="risks-title">Ограничения и риски</h3>
          {result.report.risks.length > 0 ? (
            <ul className="plainList">
              {result.report.risks.map((risk) => (
                <li key={risk}>
                  <Warning size={18} weight="duotone" />
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mutedText">
              Агент не выявил существенных ограничений.
            </p>
          )}
        </section>
        <section aria-labelledby="method-title">
          <h3 id="method-title">Методика</h3>
          <ul className="plainList">
            {result.report.methodology.map((item) => (
              <li key={item}>
                <CheckCircle size={18} weight="duotone" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="traceSection" aria-labelledby="trace-title">
        <div className="sectionHeadingRow">
          <div>
            <h3 id="trace-title">Журнал агента</h3>
            <p>Код и фактический вывод каждого запуска.</p>
          </div>
          <TerminalWindow size={24} weight="duotone" />
        </div>
        <div className="traceList">
          {result.trace.map((item) => (
            <details key={`${item.step}-${item.purpose}`}>
              <summary>
                <span className={`traceStatus ${item.status}`}>
                  {item.status === "success" ? (
                    <CheckCircle size={18} weight="fill" />
                  ) : (
                    <Warning size={18} weight="fill" />
                  )}
                </span>
                <span className="traceTitle">
                  <strong>{item.purpose}</strong>
                  <small>
                    Python, {formatDuration(item.durationMs)}
                  </small>
                </span>
                <Code size={20} />
              </summary>
              <div className="traceBody">
                <div>
                  <span className="codeLabel">Код</span>
                  <pre>
                    <code>{item.code}</code>
                  </pre>
                </div>
                {(item.stdout || item.stderr) && (
                  <div>
                    <span className="codeLabel">Вывод</span>
                    <pre className={item.stderr ? "hasError" : ""}>
                      <code>{item.stderr || item.stdout}</code>
                    </pre>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>

      <button className="chatLauncher" type="button" onClick={onOpenChat}>
        <span className="chatLauncherIcon" aria-hidden="true">
          <ChatCircleDots size={26} weight="duotone" />
        </span>
        <span className="chatLauncherCopy">
          <strong>Продолжить анализ в чате</strong>
          <small>
            {isDemo
              ? "Откройте демонстрацию диалога по этому отчету."
              : "Задайте вопрос — агент снова запустит Python по этому датасету."}
          </small>
        </span>
        <span className="chatLauncherMeta">
          <span className="liveDot" />
          {isDemo ? "Демо" : "Файл готов"}
          <ArrowRight size={18} weight="bold" />
        </span>
      </button>

      <div className="reportFootnote">
        <Info size={18} weight="duotone" />
        <span>
          Отчет сгенерирован моделью {result.meta.model}. Проверяйте критичные
          решения по журналу кода и исходному датасету.
        </span>
      </div>
    </article>
  );
}

function DatasetChat({
  result,
  entries,
  error,
  busy,
  isDemo,
  onClose,
  onSend
}: {
  result: AnalysisResponse;
  entries: ChatEntry[];
  error: UiError | null;
  busy: boolean;
  isDemo: boolean;
  onClose: () => void;
  onSend: (message: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const conversationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = conversationRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth"
    });
  }, [busy, entries]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy) {
      return;
    }
    setDraft("");
    await onSend(message);
  }

  return (
    <div
      className="chatOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Чат по датасету ${result.meta.fileName}`}
    >
      <header className="chatHeader">
        <button
          className="chatBackButton"
          type="button"
          onClick={onClose}
          disabled={busy}
        >
          <ArrowLeft size={19} weight="bold" />
          Вернуться к отчету
        </button>
        <div className="chatDatasetTitle">
          <span className="chatDatasetIcon">
            <FileCsv size={20} weight="duotone" />
          </span>
          <span>
            <strong>{result.meta.fileName}</strong>
            <small>{isDemo ? "демонстрационный диалог" : "датасет подключен"}</small>
          </span>
        </div>
        <div className="chatSessionState">
          <span className="liveDot" />
          <span>
            {isDemo ? "Демо" : "Файл прикреплен"}
          </span>
        </div>
      </header>

      <div className="chatLayout">
        <aside className="chatContext">
          <div>
            <p className="kicker">Контекст отчета</p>
            <h2>{result.report.title}</h2>
            <p>{result.report.summary}</p>
          </div>

          <div className="chatMetricList">
            {result.report.metrics.slice(0, 4).map((metric) => (
              <div key={`${metric.label}-${metric.value}`}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>

          <div className="chatAgentStatus">
            <Robot size={22} weight="duotone" />
            <span>
              <strong>{isDemo ? "Интерфейс демо" : "Python подключен"}</strong>
              <small>
                {isDemo
                  ? "Ответы показывают сценарий работы."
                  : "Для каждого ответа запускается новая песочница."}
              </small>
            </span>
          </div>
        </aside>

        <section className="chatConversation">
          <div className="chatMessages" ref={conversationRef}>
            <div className="chatConversationIntro">
              <span>
                <ChatCircleDots size={22} weight="duotone" />
              </span>
              <div>
                <strong>Диалог по конкретному датасету</strong>
                <p>
                  Агент видит отчет и продолжает исследовать тот же файл через
                  Python-интерпретатор.
                </p>
              </div>
            </div>

            {entries.map((entry) => (
              <article
                className={`chatMessage ${entry.role}`}
                key={entry.id}
              >
                <div className="chatAvatar" aria-hidden="true">
                  {entry.role === "assistant" ? (
                    <Sparkle size={17} weight="fill" />
                  ) : (
                    "Вы"
                  )}
                </div>
                <div className="chatBubble">
                  <p>{entry.content}</p>
                  {entry.evidence && entry.evidence.length > 0 && (
                    <ul className="chatEvidence">
                      {entry.evidence.map((item) => (
                        <li key={item}>
                          <CheckCircle size={16} weight="fill" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {entry.charts && entry.charts.length > 0 && (
                    <div className="chatCharts">
                      {entry.charts.map((chart) => (
                        <figure key={chart.id}>
                          <Image
                            src={`data:${chart.mimeType};base64,${chart.data}`}
                            width={960}
                            height={600}
                            unoptimized
                            alt={chart.caption}
                          />
                          <figcaption>{chart.caption}</figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                  {entry.trace && entry.trace.length > 0 && (
                    <details className="chatTrace">
                      <summary>
                        <Code size={16} />
                        Проверить вычисления: {entry.trace.length}
                      </summary>
                      <div>
                        {entry.trace.map((trace) => (
                          <details key={`${entry.id}-${trace.step}`}>
                            <summary>{trace.purpose}</summary>
                            <pre>
                              <code>{trace.code}</code>
                            </pre>
                            {trace.stdout && (
                              <pre>
                                <code>{trace.stdout}</code>
                              </pre>
                            )}
                          </details>
                        ))}
                      </div>
                    </details>
                  )}
                  <time dateTime={entry.createdAt}>
                    {formatMessageTime(entry.createdAt)}
                  </time>
                </div>
              </article>
            ))}

            {busy && (
              <article className="chatMessage assistant isThinking">
                <div className="chatAvatar" aria-hidden="true">
                  <Sparkle size={17} weight="fill" />
                </div>
                <div className="chatBubble">
                  <span className="thinkingDots" aria-label="Агент вычисляет">
                    <i />
                    <i />
                    <i />
                  </span>
                  <small>Агент пишет и запускает Python…</small>
                </div>
              </article>
            )}
          </div>

          <div className="chatComposerArea">
            {error && <ChatErrorBanner error={error} />}

            {entries.length <= 1 && !busy && (
              <div className="chatSuggestions" aria-label="Примеры вопросов">
                {chatSuggestions.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion}
                    onClick={() => void onSend(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            <form className="chatComposer" onSubmit={submit}>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                maxLength={2_000}
                rows={1}
                placeholder="Спросите о причинах, аномалиях или нужном срезе…"
                aria-label="Вопрос по датасету"
                disabled={busy}
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                aria-label="Отправить вопрос"
              >
                <PaperPlaneTilt size={20} weight="fill" />
              </button>
            </form>
            <p className="chatDisclaimer">
              {isDemo
                ? "Демо-ответы не обращаются к API."
                : "Исходный файл отправляется заново и анализируется в новой Python-песочнице."}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function ChatErrorBanner({ error }: { error: UiError }) {
  const isTemporary =
    error.code === "RATE_LIMITED" || error.code === "PROVIDER_BUSY";

  return (
    <div className={`chatErrorBanner ${isTemporary ? "temporary" : ""}`}>
      {isTemporary ? (
        <Clock size={20} weight="duotone" />
      ) : (
        <Warning size={20} weight="duotone" />
      )}
      <span>
        <strong>
          {isTemporary
            ? "Gemini временно уперлась в лимит"
            : "Не удалось получить ответ"}
        </strong>
        <small>
          {error.error}
          {isTemporary &&
            ` Повторите примерно через ${error.retryAfterSeconds ?? 60} секунд.`}
        </small>
      </span>
    </div>
  );
}

function importanceLabel(value: "high" | "medium" | "low") {
  if (value === "high") {
    return "Высокая важность";
  }
  if (value === "medium") {
    return "Средняя важность";
  }
  return "Низкая важность";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1000) {
    return `${milliseconds} мс`;
  }
  if (milliseconds < 60_000) {
    return `${(milliseconds / 1000).toFixed(1)} с`;
  }
  return `${Math.floor(milliseconds / 60_000)} мин ${Math.round(
    (milliseconds % 60_000) / 1000
  )} с`;
}

async function readJsonResponse<T>(
  response: Response
): Promise<T | ApiErrorResponse> {
  try {
    return (await response.json()) as T | ApiErrorResponse;
  } catch {
    return {
      error: response.ok
        ? "Backend вернул ответ в неизвестном формате."
        : "Backend временно недоступен. Повторите запрос позже.",
      code: response.ok ? "INTERNAL_ERROR" : "AGENT_FAILED",
      provider: "server"
    };
  }
}

function isApiError(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string" &&
    "code" in value
  );
}

function apiErrorFromPayload(
  payload: unknown,
  fallback: string
): ApiClientError {
  if (isApiError(payload)) {
    return new ApiClientError(payload);
  }
  return new ApiClientError({
    error: fallback,
    code: "AGENT_FAILED",
    provider: "server"
  });
}

function toUiError(error: unknown): UiError {
  if (error instanceof ApiClientError) {
    return error.details;
  }
  if (error instanceof TypeError) {
    return {
      error:
        "Не удалось связаться с backend. Проверьте, что Render-сервис запущен.",
      code: "AGENT_FAILED",
      provider: "server"
    };
  }
  return {
    error:
      error instanceof Error
        ? error.message
        : "Не удалось выполнить запрос.",
    code: "AGENT_FAILED",
    provider: "server"
  };
}

function createClientId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `message-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("ru", {
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
}
