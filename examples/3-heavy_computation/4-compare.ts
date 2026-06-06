/**
 * Heavy scenario — timing comparison across run(), runner, and runtime.
 *
 * The most dramatic rows are:
 *   'warn only'   — run() does all 7 ops; runner/runtime skip the 3 Somes + Or
 *   'error ↓ 180' — run() does all 7 ops; runner/runtime skip the 3 expensive
 *                   Filters and only run the now-trivial Somes (short-circuit ~200 items)
 */

import { createProgramRunner, run } from '../../src/language/runner'
import { createRuntime } from '../../src/language/runtime'
import {
  descriptor, program, slowOpsProgram, errorOpsProgram,
  scenarios, changesFrom, delta,
  time,
  type Scenario,
} from './shared'

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const runner   = createProgramRunner(program, descriptor)
const runtime  = createRuntime(descriptor)
const slowOps  = runtime.register('slowOps',  slowOpsProgram)
const errorOps = runtime.register('errorOps', errorOpsProgram)

// Warmup — let V8 JIT compile hot paths before timed runs
const warmup = { streamA: [1,2,3], streamB: [1,2,3], streamC: [1,2,3], warnThreshold: 2, errorThreshold: 3 }
run(program, descriptor, warmup)
runner.run(warmup)
runtime.updateInputs(warmup)

// ---------------------------------------------------------------------------
// Collect timings
// ---------------------------------------------------------------------------

type Row = { label: string; changed: string; runMs: number; runnerMs: number; runtimeMs: number }
const rows: Row[] = []
let prev: Scenario | undefined

for (const s of scenarios) {
  const full    = { streamA: s.streamA, streamB: s.streamB, streamC: s.streamC, warnThreshold: s.warnThreshold, errorThreshold: s.errorThreshold }
  const changes = delta(prev, s)

  const { ms: runMs }     = time(() => run(program, descriptor, full))
  const { ms: runnerMs }  = time(() => runner.run(changes))
  const { ms: runtimeMs } = time(() => runtime.updateInputs(changes))

  rows.push({ label: s.label, changed: changesFrom(prev, s), runMs, runnerMs, runtimeMs })
  prev = s
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

slowOps.unregister()
errorOps.unregister()

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function fmt(ms: number): string {
  if (ms < 0.1) return `${ms.toFixed(3)}ms`
  if (ms < 10)  return `${ms.toFixed(2)}ms`
  if (ms < 100) return `${ms.toFixed(1)}ms`
  return `${Math.round(ms)}ms`
}

function speedup(base: number, other: number): string {
  if (base < 0.5) return '—'
  const x = base / other
  return x < 1.5 ? '—' : `${x.toFixed(0)}×`
}

const C = { label: 20, changed: 18, ms: 10, gain: 7 }
const hr = '─'.repeat(C.label + C.changed + C.ms * 3 + C.gain * 2 + 6)

console.log('\n' + [
  'Scenario'.padEnd(C.label),
  'changed'.padEnd(C.changed),
  'run()'.padStart(C.ms),
  'runner'.padStart(C.ms),
  'runtime'.padStart(C.ms),
  'runner×'.padStart(C.gain + 2),
  'runtime×'.padStart(C.gain + 2),
].join('  '))
console.log(hr)

for (const r of rows) {
  console.log([
    r.label.padEnd(C.label),
    r.changed.padEnd(C.changed),
    fmt(r.runMs).padStart(C.ms),
    fmt(r.runnerMs).padStart(C.ms),
    fmt(r.runtimeMs).padStart(C.ms),
    speedup(r.runMs, r.runnerMs).padStart(C.gain + 2),
    speedup(r.runMs, r.runtimeMs).padStart(C.gain + 2),
  ].join('  '))
}

console.log(hr)
console.log()
console.log('warn only:   3 Filters run; 3 Somes + Or cached/skipped')
console.log('error ↓ 180: 3 Somes run (trivial, ~200 iter each); 3 Filters cached/skipped (saved ~900k iterations)')
console.log('stream only: 2 ops run for that stream; 4 ops cached/skipped')