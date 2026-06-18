/**
 * Heights example using Runtime with a 4-way program split.
 *
 * Programs are split by input dependency, each with its own scoped language:
 *   'men'     dependsOn: men     → avgMen,     countMen
 *   'women'   dependsOn: women   → avgWomen,   countWomen
 *   'unknown' dependsOn: unknown → avgUnknown, countUnknown
 *   'totals'  dependsOn: all     → avgTotal,   countTotal
 *
 * When only one category changes (scenarios 2–4), the Runtime's inputIndex
 * routes the update to that program and 'totals' only — the other two
 * category programs are not evaluated at all.
 * Compare timing against 1-run.ts and 2-runner.ts.
 *
 * Each program is analysed from its own RawProgram with a scoped descriptor.
 * The runtime uses a shared descriptor (inputs only) for input routing.
 */

import { analyse } from "../../src/language/analyser";
import { createRuntime } from "../../src/language/runtime";
import {
  createHeightsLang,
  assertOk,
  menRaw,
  womenRaw,
  unknownRaw,
  totalsRaw,
  scenarios,
  changesFrom,
  delta,
  displayRuntime,
  logHeader,
  type Scenario,
} from "./shared";

// Each program gets its own scoped language with only its two outputs required.

const menLang = createHeightsLang();
menLang.registerOutput({ name: "avgMen",   type: "number", mode: "required" });
menLang.registerOutput({ name: "countMen", type: "number", mode: "required" });

const womenLang = createHeightsLang();
womenLang.registerOutput({ name: "avgWomen",   type: "number", mode: "required" });
womenLang.registerOutput({ name: "countWomen", type: "number", mode: "required" });

const unknownLang = createHeightsLang();
unknownLang.registerOutput({ name: "avgUnknown",   type: "number", mode: "required" });
unknownLang.registerOutput({ name: "countUnknown", type: "number", mode: "required" });

const totalsLang = createHeightsLang();
totalsLang.registerOutput({ name: "avgTotal",   type: "number", mode: "required" });
totalsLang.registerOutput({ name: "countTotal", type: "number", mode: "required" });

const menProgram     = assertOk(analyse(menRaw,     menLang.descriptor),     "men");
const womenProgram   = assertOk(analyse(womenRaw,   womenLang.descriptor),   "women");
const unknownProgram = assertOk(analyse(unknownRaw, unknownLang.descriptor), "unknown");
const totalsProgram  = assertOk(analyse(totalsRaw,  totalsLang.descriptor),  "totals");

// The runtime uses a shared descriptor (inputs only) for input routing.
// Each program was analysed with its own scoped descriptor above.
const runtimeLang = createHeightsLang();
const runtime = createRuntime(runtimeLang.descriptor);

const menHandle     = runtime.register("men",     menProgram);
const womenHandle   = runtime.register("women",   womenProgram);
const unknownHandle = runtime.register("unknown", unknownProgram);
const totalsHandle  = runtime.register("totals",  totalsProgram);

let prev: Scenario | undefined;
const last: Record<string, Map<string, unknown>> = {
  men:     menHandle.initialOutputs,
  women:   womenHandle.initialOutputs,
  unknown: unknownHandle.initialOutputs,
  totals:  totalsHandle.initialOutputs,
};

for (const s of scenarios) {
  const changes = delta(prev, s);
  const note = changesFrom(prev, s);

  logHeader(s, note);
  const t0 = performance.now();
  const results = runtime.updateInputs(changes);
  console.log(`  updateInputs(): ${(performance.now() - t0).toFixed(3)}ms`);

  for (const [id, outputs] of results) last[id] = outputs;
  displayRuntime(results, last);
  prev = s;
}

menHandle.unregister();
womenHandle.unregister();
unknownHandle.unregister();
totalsHandle.unregister();
