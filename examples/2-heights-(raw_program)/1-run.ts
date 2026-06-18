/**
 * Heights example using run().
 *
 * run() creates fresh EvalState on every call — no caching between scenarios.
 * Every scenario recomputes everything from scratch regardless of which inputs
 * changed. Compare timing against 2-runner.ts and 3-runtime.ts.
 */

import { run } from "../../src/language/runtime/runner";
import { fullLang, fullProgram, scenarios, changesFrom, display, logHeader, type Scenario } from "./shared";

for (let i = 0; i < scenarios.length; i++) {
  const s = scenarios[i];
  const prev = scenarios[i - 1] as Scenario | undefined;

  logHeader(s, changesFrom(prev, s));
  const t0 = performance.now();
  const outputs = run(fullProgram, fullLang.descriptor, { men: s.men, women: s.women, unknown: s.unknown });
  console.log(`  run(): ${(performance.now() - t0).toFixed(3)}ms`);
  display(outputs);
}
