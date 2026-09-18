import { describe, expect, it } from "vitest";

import { diagnosticList } from "./diagnostics";
import { createEnvironment } from "./environment";
import { type PortLayer, Policy } from "./infra/ports";
import { deserialise } from "./infra/serialise";
import { createStdlib } from "./stdlib";

// Every documented diagnostic, provoked. The registry is what the docs print and what tells
// a reader which sample to try, so an entry describing something the language no longer does
// is worse than no entry at all.
//
// An entry is checked at the stage it claims: a `ports` one has to fail composition, a
// `parse` or `analyse` one has to come out of the pipeline. "Includes", not "equals": one
// mistake cascades, and a sample that provokes a second diagnostic on the way is fine.
//
// Two samples are `ast` form, for the kinds no text can express (an op that does not exist,
// a lambda's return annotation). Those skip the parser: deserialise, then analyse.

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

  it("says why, for every sample that is a graph rather than text", () => {
    for (const entry of withExample) {
      if (entry.example!.form === "code") continue;
      expect(
        entry.builtAsGraph,
        `${entry.kind}: an ast sample has to say why no text expresses it`,
      ).toBeTruthy();
      // And show the shape in Dendrite terms - which must NOT be a valid program, or the
      // sample would not have needed to be a graph in the first place.
      expect(entry.asIfText, `${entry.kind}: no Dendrite shape to read`).toBeTruthy();
      const parsed = env.parse(entry.asIfText!);
      const analysed = parsed.ok ? env.forProgram([], []) : null;
      if (parsed.ok && analysed?.ok) {
        const errors = analysed.environment.analyse(parsed.program).errors;
        expect(
          errors.length,
          `${entry.kind}: its asIfText compiles, so the syntax does express it`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it.for(withExample.map((entry) => [entry.kind, entry] as const))("%s", ([kind, entry]) => {
    const example = entry.example!;
    if (example.form === "rete") throw new Error(`${kind}: a rete sample cannot be loaded`);
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

    if (example.form === "ast") {
      // No parser involved: this is the shape a host builds, or a stored graph.
      const analysed = pipeline.analyse(deserialise(example));
      const produced = [...analysed.errors, ...analysed.warnings].map((d) => d.kind);
      expect(
        produced,
        `${kind}: the sample produced ${produced.join(", ") || "nothing"}`,
      ).toContain(kind);
      return;
    }

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
