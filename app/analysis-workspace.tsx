"use client";

import Image from "next/image";
import {
  ArrowRight,
  ChartBar,
  ChartScatter,
  CheckCircle,
  Code,
  Database,
  DownloadSimple,
  FileCsv,
  FileXls,
  Flask,
  Info,
  Play,
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
  ApiErrorResponse
} from "@/lib/contracts";

type ViewState = "idle" | "analyzing" | "success" | "error";

const API_URL = (
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8787"
).replace(/\/$/, "");

const progressStages = [
  "Загружаем файл в изолированную среду",
  "Агент исследует структуру и качество",
  "Python считает метрики и строит графики",
  "Gemini проверяет факты и собирает отчет"
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
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [progressStage, setProgressStage] = useState(0);

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
      setError("Поддерживаются только CSV и XLSX.");
      setViewState("error");
      return;
    }

    if (candidate.size > 10 * 1024 * 1024) {
      setError("Файл превышает лимит 10 МБ.");
      setViewState("error");
      return;
    }

    if (candidate.size === 0) {
      setError("Файл пуст.");
      setViewState("error");
      return;
    }

    setFile(candidate);
    setError("");
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
      setError("Сначала выберите датасет.");
      setViewState("error");
      return;
    }

    setViewState("analyzing");
    setProgressStage(0);
    setError("");
    setResult(null);

    const body = new FormData();
    body.append("file", file);
    body.append("instructions", instructions);

    try {
      const response = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        body
      });
      const payload = (await response.json()) as
        | AnalysisResponse
        | ApiErrorResponse;

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload ? payload.error : "Анализ не завершен."
        );
      }

      setResult(payload);
      setViewState("success");
      revealResult();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось связаться с backend."
      );
      setViewState("error");
    }
  }

  function showDemo() {
    setResult(demoResult);
    setViewState("success");
    setError("");
    revealResult();
  }

  function reset() {
    setFile(null);
    setInstructions("");
    setResult(null);
    setError("");
    setViewState("idle");
    setProgressStage(0);
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
          {viewState === "error" && (
            <ErrorState message={error} onRetry={() => setViewState("idle")} />
          )}
          {viewState === "success" && result && (
            <ReportView result={result} onReset={reset} />
          )}
        </section>
      </section>

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
  message,
  onRetry
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="errorState">
      <span className="errorIcon">
        <Warning size={34} weight="duotone" />
      </span>
      <h2>Анализ остановлен</h2>
      <p>{message}</p>
      <button className="secondaryButton" type="button" onClick={onRetry}>
        Вернуться к форме
      </button>
    </div>
  );
}

function ReportView({
  result,
  onReset
}: {
  result: AnalysisResponse;
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
