import { z } from "zod";

export const metricSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(80),
  interpretation: z.string().min(1).max(240)
});

export const insightSchema = z.object({
  title: z.string().min(1).max(120),
  evidence: z.string().min(1).max(500),
  importance: z.enum(["high", "medium", "low"])
});

export const reportSchema = z.object({
  title: z.string().min(1).max(140),
  summary: z.string().min(1).max(1600),
  metrics: z.array(metricSchema).min(2).max(8),
  insights: z.array(insightSchema).min(2).max(8),
  risks: z.array(z.string().min(1).max(360)).max(6),
  methodology: z.array(z.string().min(1).max(280)).min(1).max(8)
});

export type AnalysisReport = z.infer<typeof reportSchema>;

export type TraceStatus = "success" | "error" | "blocked";

export interface AgentTrace {
  step: number;
  purpose: string;
  code: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  status: TraceStatus;
}

export interface AnalysisChart {
  id: string;
  mimeType: "image/png" | "image/jpeg";
  data: string;
  caption: string;
}

export interface AnalysisResponse {
  report: AnalysisReport;
  charts: AnalysisChart[];
  trace: AgentTrace[];
  meta: {
    fileName: string;
    fileSize: number;
    model: string;
    toolCalls: number;
    durationMs: number;
  };
}

export interface ApiErrorResponse {
  error: string;
  code:
    | "BAD_REQUEST"
    | "FILE_TOO_LARGE"
    | "UNSUPPORTED_FILE"
    | "NOT_CONFIGURED"
    | "RATE_LIMITED"
    | "AGENT_FAILED"
    | "INTERNAL_ERROR";
}

