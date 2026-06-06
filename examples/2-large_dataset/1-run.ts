/**
 * Core language using run().
 *
 * run() creates fresh EvalState on every call. No state is carried between
 * evaluations, every scenario computes from scratch regardless of how similar
 * it is to the previous one.
 *
 * Scenarios 5–7 share the same 10k values array; 8–9 share 100k.
 * run() recomputes everything regardless — compare timing against
 * core.runner.example and core.runtime.example.
 */

import { run } from "../../src/language/runner";
import {
  descriptor,
  program,
  scenarios,
  changesFrom,
  display,
  timed,
  logHeader,
  type Scenario,
} from "./shared";

for (let i = 0; i < scenarios.length; i++) {
  const s = scenarios[i];
  const prev = scenarios[i - 1] as Scenario | undefined;
  const what = changesFrom(prev, s);
  const note =
    what === "threshold only" ? `${what}, run() recomputes all anyway` : what;

  logHeader(s, note);
  const outputs = timed("run()", () =>
    run(program, descriptor, { values: s.values, threshold: s.threshold }),
  );
  display(outputs);
}
