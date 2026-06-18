/**
 * Heights example using run().
 *
 * run() creates fresh EvalState on every call — no caching between scenarios.
 * Every scenario recomputes everything from scratch regardless of which inputs
 * changed. Compare timing against 2-runner.ts and 3-runtime.ts.
 *
 * The RawProgram is compiled once via analyse() below.
 */

import { analyse } from "../../src/language/analyser";
import { run } from "../../src/language/runner";
import {
  createHeightsLang,
  assertOk,
  fullRaw,
  scenarios,
  changesFrom,
  display,
  logHeader,
  type Scenario,
} from "./shared";

const lang = createHeightsLang();
lang.registerOutput({ name: "avgMen",      type: "number", mode: "required" });
lang.registerOutput({ name: "avgWomen",    type: "number", mode: "required" });
lang.registerOutput({ name: "avgUnknown",  type: "number", mode: "required" });
lang.registerOutput({ name: "avgTotal",    type: "number", mode: "required" });
lang.registerOutput({ name: "countMen",    type: "number", mode: "required" });
lang.registerOutput({ name: "countWomen",  type: "number", mode: "required" });
lang.registerOutput({ name: "countUnknown", type: "number", mode: "required" });
lang.registerOutput({ name: "countTotal",  type: "number", mode: "required" });

const program = assertOk(analyse(fullRaw, lang.descriptor), "heights/full");

for (let i = 0; i < scenarios.length; i++) {
  const s = scenarios[i];
  const prev = scenarios[i - 1] as Scenario | undefined;
  const note = changesFrom(prev, s);

  logHeader(s, note);
  const t0 = performance.now();
  const outputs = run(program, lang.descriptor, { men: s.men, women: s.women, unknown: s.unknown });
  console.log(`  run(): ${(performance.now() - t0).toFixed(3)}ms`);
  display(outputs);
}
