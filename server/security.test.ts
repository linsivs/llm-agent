import { describe, expect, it } from "vitest";

import {
  safeFileName,
  sanitizeUserContext,
  truncateToolOutput,
  validateFileSignature,
  validatePythonCode
} from "@/server/security";

describe("sanitizeUserContext", () => {
  it("removes control characters and limits length", () => {
    const value = `  продажи\u0000   по регионам ${"x".repeat(3_000)} `;
    const result = sanitizeUserContext(value);

    expect(result).not.toContain("\u0000");
    expect(result.length).toBeLessThanOrEqual(2_000);
    expect(result.startsWith("продажи по регионам")).toBe(true);
  });
});

describe("validatePythonCode", () => {
  it("allows normal pandas analysis", () => {
    const result = validatePythonCode(`
import pandas as pd
df = pd.read_csv(DATASET_PATH)
print(df.describe(include="all"))
`);

    expect(result.ok).toBe(true);
  });

  it.each([
    "import os\nprint(os.environ)",
    "import requests\nrequests.get('https://example.com')",
    "import subprocess\nsubprocess.run(['ls'])",
    "import pandas, os\nprint(os.environ)",
    "from pathlib import Path\nPath('/etc/passwd').read_text()",
    "open('/etc/passwd').read()",
    "__import__('os').system('id')",
    "!pip install polars"
  ])("blocks unsafe code: %s", (code) => {
    expect(validatePythonCode(code).ok).toBe(false);
  });
});

describe("output and filename helpers", () => {
  it("normalizes the sandbox filename", () => {
    expect(safeFileName("../../report.XLSX")).toBe("dataset.xlsx");
    expect(safeFileName("sales.csv")).toBe("dataset.csv");
  });

  it("truncates oversized tool output", () => {
    expect(truncateToolOutput("x".repeat(20_000))).toContain(
      "[вывод сокращен сервером]"
    );
  });

  it("checks CSV and XLSX signatures", () => {
    expect(
      validateFileSignature(new Uint8Array([0x61, 0x2c, 0x62]), ".csv")
    ).toBe(true);
    expect(
      validateFileSignature(new Uint8Array([0x61, 0x00, 0x62]), ".csv")
    ).toBe(false);
    expect(
      validateFileSignature(
        new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
        ".xlsx"
      )
    ).toBe(true);
    expect(
      validateFileSignature(new Uint8Array([0x50, 0x4b, 0x05, 0x06]), ".xlsx")
    ).toBe(false);
  });
});
