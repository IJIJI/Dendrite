/**
 * Core language: timing comparison.
 *
 * Runs all three execution styles across every scenario and prints a table.
 * The dramatic rows are the threshold-only scenarios, run() pays full price
 * each time while runner and runtime exploit the unchanged values array.
 *
 * runner:  anyCumLaude returned from nodeCache, no list iteration
 * runtime: 'honors' program not in affected set, not evaluated at all
 */

import { createProgramRunner, run } from "../../src/language/runner";
import { createRuntime } from "../../src/language/runtime";
import {
  descriptor,
  program,
  filteringProgram,
  honorsProgram,
  scenarios,
  changesFrom,
  delta,
  time,
  type Scenario,
} from "./shared";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const runner = createProgramRunner(program, descriptor);
const runtime = createRuntime(descriptor);
const filtering = runtime.register("filtering", filteringProgram);
const honors = runtime.register("honors", honorsProgram);

// Warmup - let V8 JIT compile hot paths before timed runs
run(program, descriptor, { values: [1, 2, 3], threshold: 2 });
runner.run({ values: [1, 2, 3], threshold: 2 });
runtime.updateInputs({ values: [1, 2, 3], threshold: 2 });

// ---------------------------------------------------------------------------
// Collect timings
// ---------------------------------------------------------------------------

type Row = {
  label: string;
  count: number;
  changed: string;
  runMs: number;
  runnerMs: number;
  runtimeMs: number;
};

const rows: Row[] = [];
let prev: Scenario | undefined;

for (const s of scenarios) {
  const changes = delta(prev, s);

  const { ms: runMs } = time(() =>
    run(program, descriptor, { values: s.values, threshold: s.threshold }),
  );
  const { ms: runnerMs } = time(() => runner.run(changes));
  const { ms: runtimeMs } = time(() => runtime.updateInputs(changes));

  rows.push({
    label: s.label,
    count: s.values.length,
    changed: changesFrom(prev, s),
    runMs,
    runnerMs,
    runtimeMs,
  });
  prev = s;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

filtering.unregister();
honors.unregister();

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function fmt(ms: number): string {
  if (ms < 1) return `${ms.toFixed(3)}ms`;
  if (ms < 10) return `${ms.toFixed(2)}ms`;
  if (ms < 100) return `${ms.toFixed(1)}ms`;
  return `${Math.round(ms)}ms`;
}

function speedup(base: number, other: number): string {
  if (base < 0.05) return "-";
  const x = base / other;
  return x < 1.5 ? "-" : `${x.toFixed(0)}×`;
}

const C = { label: 22, count: 7, changed: 18, ms: 9, gain: 6 };
const hr = "-".repeat(C.label + C.count + 2 + C.changed + C.ms + C.ms + C.ms + C.gain + C.gain + 4);

console.log(
  "\n" +
    [
      "Scenario".padEnd(C.label),
      "inputs".padStart(C.count),
      "  " + "changed".padEnd(C.changed),
      "run()".padStart(C.ms),
      "runner".padStart(C.ms),
      "runtime".padStart(C.ms),
      "runnerx".padStart(C.gain + 2),
      "runtimex".padStart(C.gain + 2),
    ].join(""),
);
console.log(hr);

for (const r of rows) {
  console.log(
    [
      r.label.padEnd(C.label),
      String(r.count).padStart(C.count),
      "  " + r.changed.padEnd(C.changed),
      fmt(r.runMs).padStart(C.ms),
      fmt(r.runnerMs).padStart(C.ms),
      fmt(r.runtimeMs).padStart(C.ms),
      speedup(r.runMs, r.runnerMs).padStart(C.gain + 2),
      speedup(r.runMs, r.runtimeMs).padStart(C.gain + 2),
    ].join(""),
  );
}

console.log(hr);
console.log("x columns show speedup for threshold-only scenarios.");
console.log("runner:  anyCumLaude from nodeCache, no list iteration.");
console.log("runtime: honors program skipped entirely by inputIndex routing.");
