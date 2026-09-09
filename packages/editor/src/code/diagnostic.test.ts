import { type ProgramDiagnostic } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { sortDiagnostics, summarise } from "./diagnostic";

const diag = (severity: "error" | "warning", kind: string): ProgramDiagnostic => ({
  stage: "analyse",
  severity,
  kind,
  message: kind,
});

describe("sortDiagnostics", () => {
  it("puts errors first and keeps each severity's own order", () => {
    const sorted = sortDiagnostics([
      diag("warning", "w1"),
      diag("error", "e1"),
      diag("warning", "w2"),
      diag("error", "e2"),
    ]);
    expect(sorted.map((d) => d.kind)).toEqual(["e1", "e2", "w1", "w2"]);
  });
});

describe("summarise", () => {
  it("says so when there is nothing", () => {
    expect(summarise([])).toEqual({ text: "No problems" });
  });

  it("counts by severity, worst first, and names the worst", () => {
    expect(summarise([diag("warning", "w")])).toEqual({ text: "1 warning", severity: "warning" });
    expect(summarise([diag("error", "e"), diag("error", "e"), diag("warning", "w")])).toEqual({
      text: "2 errors · 1 warning",
      severity: "error",
    });
  });
});
