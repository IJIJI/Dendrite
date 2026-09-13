import { describe, expect, it } from "vitest";

import { diagnosticList } from "./diagnostics";
import { createEnvironment } from "./environment";
import { type PortLayer, Policy } from "./infra/ports";
import { createStdlib } from "./stdlib";

// Every documented diagnostic, provoked. The registry is what the docs print and what tells
// a reader which sample to try, so an entry describing something the language no longer does
// is worse than no entry at all.
//
// An entry is checked at the stage it claims: a `ports` one has to fail composition, a
// `parse` or `analyse` one has to come out of the pipeline. "Includes", not "equals": one
// mistake cascades, and a sample that provokes a second diagnostic on the way is fine.

const env = createEnvironment(createStdlib());

/** Compose the sample's own ports as its document layer, the way an instance would. */
function compose(ports: PortLayer["ports"] | undefined) {
  const layers: PortLayer[] = ports ? [{ id: "doc", ports, policy: Policy.user }] : [];
  return env.forProgram([], layers);
}

describe("the diagnostics registry", () => {
  const documented = diagnosticList;

  it("documents every kind with either a sample or a reason there is none", () => {
    for (const entry of documented) {
      expect(
        Boolean(entry.example) || Boolean(entry.triggeredBy),
        `${entry.kind} has neither an example nor a triggeredBy`,
      ).toBe(true);
      expect(entry.message.length, `${entry.kind} has no message`).toBeGreaterThan(10);
    }
  });

  const withExample = documented.filter((entry) => entry.example);

  it("has samples to run", () => {
    expect(withExample.length).toBeGreaterThan(25);
  });

  it.for(withExample.map((entry) => [entry.kind, entry] as const))("%s", ([kind, entry]) => {
    const example = entry.example!;
    if (example.form !== "code") throw new Error(`${kind}: the sample is not code form`);
    const composed = compose(example.ports);

    if (entry.stage === "ports") {
      expect(composed.ok, `${kind}: its ports composed cleanly, so it provokes nothing`).toBe(
        false,
      );
      if (composed.ok) return;
      expect(composed.problems.map((p) => p.kind)).toContain(kind);
      return;
    }

    if (!composed.ok) {
      throw new Error(
        `${kind}: the sample's ports do not compose - ${composed.problems.map((p) => p.message).join("; ")}`,
      );
    }
    const pipeline = composed.environment;
    const parsed = pipeline.parse(example.source);
    if (!parsed.ok) {
      expect(
        [...parsed.errors, ...parsed.warnings].map((d) => d.kind),
        `${kind}: parsing produced other diagnostics`,
      ).toContain(kind);
      return;
    }
    // A parse WARNING leaves the program usable, so its kinds travel on with the analysis.
    const analysed = pipeline.analyse(parsed.program);
    const produced = [...parsed.warnings, ...analysed.errors, ...analysed.warnings].map(
      (d) => d.kind,
    );
    expect(produced, `${kind}: the sample produced ${produced.join(", ") || "nothing"}`).toContain(
      kind,
    );
  });
});
