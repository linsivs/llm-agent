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

export const chatAnswerSchema = z.object({
  answer: z.string().min(1).max(4_000),
  evidence: z.array(z.string().min(1).max(360)).min(1).max(6)
});

export const chatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().trim().min(1).max(2_000)
});

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  evidence?: string[];
}

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
    sessionId?: string;
    sessionExpiresAt?: string;
    chatAvailable?: boolean;
  };
}

export interface ChatResponse {
  message: ChatMessage;
  charts: AnalysisChart[];
  trace: AgentTrace[];
  meta: {
    model: string;
    toolCalls: number;
    durationMs: number;
    sessionExpiresAt: string;
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
    | "PROVIDER_BUSY"
    | "SESSION_EXPIRED"
    | "AGENT_FAILED"
    | "INTERNAL_ERROR";
  provider?: "gemini" | "e2b" | "server";
  retryAfterSeconds?: number;
}
