/**
 * Heights example using Runtime with a 4-way program split.
 *
 * Programs are split by input dependency:
 *   'men'     dependsOn: men     → avgMen,     countMen
 *   'women'   dependsOn: women   → avgWomen,   countWomen
 *   'unknown' dependsOn: unknown → avgUnknown, countUnknown
 *   'totals'  dependsOn: all     → avgTotal,   countTotal
 *
 * When only one category changes (scenarios 2–4), the Runtime's inputIndex
 * routes the update to that program and 'totals' only — the other two
 * category programs are not evaluated at all.
 * Compare timing against 1-run.ts and 2-runner.ts.
 */

import { createRuntime } from "../../src/language/runtime/runtime";
import {
  lang,
  HOST,
  MEN,
  WOMEN,
  UNKNOWN,
  TOTALS,
  menProgram,
  womenProgram,
  unknownProgram,
  totalsProgram,
  scenarios,
  changesFrom,
  delta,
  logHeader,
  type Scenario,
} from "./shared";

// The measurements are global; each program brings the outputs it declares.
const runtime = createRuntime(lang.descriptor, { layers: [HOST] });

const menHandle = runtime.register("men", menProgram, { ports: MEN.ports });
const womenHandle = runtime.register("women", womenProgram, { ports: WOMEN.ports });
const unknownHandle = runtime.register("unknown", unknownProgram, { ports: UNKNOWN.ports });
const totalsHandle = runtime.register("totals", totalsProgram, { ports: TOTALS.ports });

let prev: Scenario | undefined;
const last: Record<string, Map<string, unknown>> = {
  men: menHandle.initialOutputs,
  women: womenHandle.initialOutputs,
  unknown: unknownHandle.initialOutputs,
  totals: totalsHandle.initialOutputs,
};

for (const s of scenarios) {
  logHeader(s, changesFrom(prev, s));
  const t0 = performance.now();
  const results = runtime.updateInputs(delta(prev, s));
  console.log(`  updateInputs(): ${(performance.now() - t0).toFixed(3)}ms`);

  for (const [id, outputs] of results) last[id] = outputs;

  const get = (prog: string) => results.get(prog) ?? last[prog];
  const fmt = (prog: string, key: string) => (get(prog).get(key) as number).toFixed(1);
  const skipped = ["men", "women", "unknown", "totals"].filter((k) => !results.has(k));

  console.log(
    `  avg:   men=${fmt("men", "avgMen")}  women=${fmt("women", "avgWomen")}  unknown=${fmt("unknown", "avgUnknown")}  total=${fmt("totals", "avgTotal")}`,
  );
  console.log(
    `  >185:  men=${get("men").get("countMen")}  women=${get("women").get("countWomen")}  unknown=${get("unknown").get("countUnknown")}  total=${get("totals").get("countTotal")}`,
  );
  if (skipped.length) console.log(`  (skipped — no change: ${skipped.join(", ")})`);

  prev = s;
}

menHandle.unregister();
womenHandle.unregister();
unknownHandle.unregister();
totalsHandle.unregister();
