/**
 * Heights example using ProgramRunner.
 *
 * createProgramRunner() maintains EvalState across calls. delta() passes only
 * the inputs that actually changed, so unchanged categories are not recomputed.
 * Scenarios 2–4 each change only one category — the other two are served from
 * nodeCache. Compare timing against 1-run.ts and 3-runtime.ts.
 */

import { createProgramRunner } from "../../src/language/runtime/runner";
import {
  fullDescriptor,
  fullProgram,
  scenarios,
  changesFrom,
  delta,
  display,
  logHeader,
  type Scenario,
} from "./shared";

const runner = createProgramRunner(fullProgram, fullDescriptor);
let prev: Scenario | undefined;

for (const s of scenarios) {
  logHeader(s, changesFrom(prev, s));
  const t0 = performance.now();
  const outputs = runner.run(delta(prev, s));
  console.log(`  runner.run(): ${(performance.now() - t0).toFixed(3)}ms`);
  display(outputs);
  prev = s;
}
