const MAX_CONTEXT_LENGTH = 2_000;
const MAX_CODE_LENGTH = 16_000;
const MAX_TOOL_OUTPUT_LENGTH = 14_000;

const blockedPythonPatterns: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern:
      /\bimport\s+[^\n#]*(?:\bos\b|\bsubprocess\b|\bsocket\b|\brequests\b|\bhttpx\b|\burllib\b|\bftplib\b|\bparamiko\b|\bmultiprocessing\b|\bshutil\b|\bpathlib\b|\bbuiltins\b)/i,
    reason: "Импорт системных, сетевых или процессных модулей запрещен."
  },
  {
    pattern:
      /\bfrom\s+(?:os|subprocess|socket|requests|httpx|urllib|ftplib|paramiko|multiprocessing|shutil|pathlib|builtins)\b/i,
    reason: "Импорт системных, сетевых или процессных модулей запрещен."
  },
  {
    pattern: /\b(?:eval|exec|compile|__import__|globals|locals)\s*\(/i,
    reason: "Динамическое выполнение Python запрещено."
  },
  {
    pattern: /\b(?:getenv|environ|system|popen|spawn|fork)\b/i,
    reason: "Доступ к окружению и системным процессам запрещен."
  },
  {
    pattern: /(?:^|\n)\s*[!%](?:pip|conda|bash|sh|system)\b/im,
    reason: "Shell и установка пакетов запрещены."
  },
  {
    pattern: /\bopen\s*\(/i,
    reason: "Прямое открытие файлов запрещено. Используйте pandas."
  },
  {
    pattern: /\bPath\s*\(/,
    reason: "Прямой доступ к файловой системе запрещен."
  },
  {
    pattern: /(?:\/etc\/|\/proc\/|\/sys\/|\/root\/|\.\.\/)/i,
    reason: "Доступ за пределы загруженного датасета запрещен."
  }
];

export function sanitizeUserContext(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CONTEXT_LENGTH);
}

export function validatePythonCode(code: unknown):
  | { ok: true; code: string }
  | { ok: false; reason: string } {
  if (typeof code !== "string" || !code.trim()) {
    return { ok: false, reason: "Агент не передал Python-код." };
  }

  if (code.length > MAX_CODE_LENGTH) {
    return {
      ok: false,
      reason: `Python-код превышает лимит ${MAX_CODE_LENGTH} символов.`
    };
  }

  for (const rule of blockedPythonPatterns) {
    if (rule.pattern.test(code)) {
      return { ok: false, reason: rule.reason };
    }
  }

  return { ok: true, code: code.trim() };
}

export function truncateToolOutput(value: unknown): string {
  const normalized =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);

  if (normalized.length <= MAX_TOOL_OUTPUT_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_TOOL_OUTPUT_LENGTH)}\n[вывод сокращен сервером]`;
}

export function safeFileName(value: string): string {
  const extension = value.toLowerCase().endsWith(".xlsx") ? ".xlsx" : ".csv";
  return `dataset${extension}`;
}

export function validateFileSignature(
  bytes: Uint8Array,
  extension: ".csv" | ".xlsx"
): boolean {
  if (bytes.length === 0) {
    return false;
  }

  if (extension === ".xlsx") {
    return (
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04
    );
  }

  return !bytes.slice(0, 4_096).includes(0);
}
