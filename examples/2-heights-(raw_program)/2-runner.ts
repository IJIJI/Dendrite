/**
 * Heights example using ProgramRunner.
 *
 * createProgramRunner() maintains EvalState across calls. delta() passes only
 * the inputs that actually changed, so unchanged categories are not recomputed.
 *
 * Scenarios 2–4 each change only one category — the other two categories'
 * Reduce/Filter chains are served from nodeCache. Compare timing against
 * 1-run.ts and 3-runtime.ts.
 *
 * The RawProgram is compiled once via analyse() below.
 */

import { analyse } from "../../src/language/analyser";
import { createProgramRunner } from "../../src/language/runner";
import {
  createHeightsLang,
  assertOk,
  fullRaw,
  scenarios,
  changesFrom,
  delta,
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
const runner = createProgramRunner(program, lang.descriptor);

let prev: Scenario | undefined;

for (const s of scenarios) {
  const changes = delta(prev, s);
  const note = changesFrom(prev, s);

  logHeader(s, note);
  const t0 = performance.now();
  const outputs = runner.run(changes);
  console.log(`  runner.run(): ${(performance.now() - t0).toFixed(3)}ms`);
  display(outputs);
  prev = s;
}
