import { randomUUID } from "node:crypto";

import type { Sandbox } from "@e2b/code-interpreter";

import type { AnalysisReport, ChatMessage } from "@/lib/contracts";

export const SESSION_TTL_MS = 15 * 60 * 1_000;
export const SANDBOX_TIMEOUT_MS = SESSION_TTL_MS + 2 * 60 * 1_000;
const MAX_ACTIVE_SESSIONS = 20;
const MAX_CHAT_HISTORY = 16;

export interface DatasetSession {
  id: string;
  sandbox: Sandbox;
  datasetPath: string;
  fileName: string;
  model: string;
  report: AnalysisReport;
  history: ChatMessage[];
  createdAt: number;
  expiresAt: number;
}

export class SessionExpiredError extends Error {
  constructor() {
    super(
      "Сессия датасета завершилась. Загрузите файл повторно, чтобы продолжить."
    );
    this.name = "SessionExpiredError";
  }
}

const sessions = new Map<string, DatasetSession>();

export async function createDatasetSession({
  sandbox,
  datasetPath,
  fileName,
  model,
  report,
  now = Date.now()
}: {
  sandbox: Sandbox;
  datasetPath: string;
  fileName: string;
  model: string;
  report: AnalysisReport;
  now?: number;
}): Promise<DatasetSession> {
  await cleanupExpiredSessions(now);

  if (sessions.size >= MAX_ACTIVE_SESSIONS) {
    const oldest = [...sessions.values()].sort(
      (left, right) => left.createdAt - right.createdAt
    )[0];
    if (oldest) {
      await closeDatasetSession(oldest.id);
    }
  }

  const session: DatasetSession = {
    id: randomUUID(),
    sandbox,
    datasetPath,
    fileName,
    model,
    report,
    history: [],
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  };

  sessions.set(session.id, session);
  return session;
}

export async function getDatasetSession(
  sessionId: string,
  now = Date.now()
): Promise<DatasetSession> {
  await cleanupExpiredSessions(now);

  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= now) {
    throw new SessionExpiredError();
  }

  session.expiresAt = now + SESSION_TTL_MS;
  await session.sandbox
    .setTimeout(SANDBOX_TIMEOUT_MS)
    .catch(() => undefined);
  return session;
}

export function appendSessionMessage(
  session: DatasetSession,
  message: ChatMessage
) {
  session.history.push(message);
  if (session.history.length > MAX_CHAT_HISTORY) {
    session.history.splice(0, session.history.length - MAX_CHAT_HISTORY);
  }
}

export async function closeDatasetSession(sessionId: string): Promise<boolean> {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  sessions.delete(sessionId);
  await session.sandbox.kill().catch(() => false);
  return true;
}

export async function cleanupExpiredSessions(now = Date.now()) {
  const expiredIds = [...sessions.values()]
    .filter((session) => session.expiresAt <= now)
    .map((session) => session.id);

  await Promise.all(expiredIds.map((id) => closeDatasetSession(id)));
}

export function sessionExpiresAt(session: DatasetSession): string {
  return new Date(session.expiresAt).toISOString();
}

export function activeSessionCountForTests() {
  return sessions.size;
}

export async function resetSessionsForTests() {
  await Promise.all([...sessions.keys()].map((id) => closeDatasetSession(id)));
}
