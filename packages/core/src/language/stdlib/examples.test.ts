import { describe, expect, it } from "vitest";

import { createEnvironment } from "../environment";
import { createStdlib } from "./index";

//? Every stdlib op documents itself: a description and at least one example, each a program
// that LOADS against the stdlib - the same path the runtime takes, so a rete-form example is
// covered by the same line the day its loader exists - and RUNS, since the reference page
// shows what each example produces. A rot guard, not a behaviour test: nothing here says
// what the output should be, only that there is one.

const env = createEnvironment(createStdlib());
// No ports: examples are self-contained and their outputs are undeclared, which only warns.
const composed = env.forProgram([], []);
if (!composed.ok) throw new Error("the stdlib composes on its own");
const pipeline = composed.environment;

describe("every stdlib op documents itself", () => {
  for (const op of env.language.descriptor.ops.values()) {
    it(`${op.name}: a description and loading examples`, () => {
      expect(op.description, `${op.name} has no description`).toBeTruthy();
      expect(op.examples?.length ?? 0, `${op.name} has no examples`).toBeGreaterThan(0);
      for (const example of op.examples ?? []) {
        const label = example.form === "code" ? example.source : `(${example.form} form)`;
        const result = pipeline.load(example);
        const why = result.ok ? "" : result.errors.map((e) => e.message).join("; ");
        expect(result.ok, `${op.name}: ${label}\n${why}`).toBe(true);
        if (result.ok) {
          expect(
            () => pipeline.run(result.program, {}),
            `${op.name}: ${label} throws`,
          ).not.toThrow();
        }
      }
    });
  }
});
