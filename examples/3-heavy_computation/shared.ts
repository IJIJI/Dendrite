/**
 * Heavy scenario: multi-stream response-time analysis.
 *
 * Three streams of server response times (1–200ms, 300k items each).
 * Two independent thresholds — warn and error — creating a clean dependency
 * boundary that the Runtime can exploit:
 *
 *   'slowOps'   — Filter each stream above warnThreshold
 *                 dependsOn: streamA, streamB, streamC, warnThreshold
 *
 *   'errorOps'  — Detect errors + systemCritical
 *                 dependsOn: streamA, streamB, streamC, errorThreshold
 *
 * errorThreshold starts at 200 (= max item value), so anyError always iterates
 * the entire stream before returning false — no early short-circuit.
 * When errorThreshold drops below 200, anyError short-circuits quickly, making
 * the cached Filter operations (slowOps) represent an enormous amount of saved work.
 *
 * Expected speedups vs run():
 *   warnThreshold change  → ~3×   (3 Filters run, 3 Somes + Or cached/skipped)
 *   single stream refresh → ~3×   (2 ops run for that stream, 4 cached)
 *   errorThreshold drop   → ~50×+ (3 tiny Somes run, 3 expensive Filters cached/skipped)
 */

import { createCoreLanguage } from '../../src/language/core'
import { CoreProgram } from '../../src/language/program'
import {
  CInputNode, CRefNode, COperationNode, CHigherOrderNode,
} from '../../src/language/nodes'

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

export const lang = createCoreLanguage()

lang.registerInput({ name: 'streamA',        type: 'any',    default: [] })
lang.registerInput({ name: 'streamB',        type: 'any',    default: [] })
lang.registerInput({ name: 'streamC',        type: 'any',    default: [] })
lang.registerInput({ name: 'warnThreshold',  type: 'number', default: 100 })
lang.registerInput({ name: 'errorThreshold', type: 'number', default: 200 })

lang.registerOutput({ name: 'slowA',          type: 'any',     mode: 'required' })
lang.registerOutput({ name: 'slowB',          type: 'any',     mode: 'required' })
lang.registerOutput({ name: 'slowC',          type: 'any',     mode: 'required' })
lang.registerOutput({ name: 'anyErrorA',      type: 'boolean', mode: 'required' })
lang.registerOutput({ name: 'anyErrorB',      type: 'boolean', mode: 'required' })
lang.registerOutput({ name: 'anyErrorC',      type: 'boolean', mode: 'required' })
lang.registerOutput({ name: 'systemCritical', type: 'boolean', mode: 'required' })

export const { descriptor } = lang

// ---------------------------------------------------------------------------
// Shared nodes
// ---------------------------------------------------------------------------

const streamAInput:     CInputNode = { kind: 'input', name: 'streamA',        type: 'any',    dependsOn: new Set(['streamA'])        }
const streamBInput:     CInputNode = { kind: 'input', name: 'streamB',        type: 'any',    dependsOn: new Set(['streamB'])        }
const streamCInput:     CInputNode = { kind: 'input', name: 'streamC',        type: 'any',    dependsOn: new Set(['streamC'])        }
const warnThreshInput:  CInputNode = { kind: 'input', name: 'warnThreshold',  type: 'number', dependsOn: new Set(['warnThreshold'])  }
const errorThreshInput: CInputNode = { kind: 'input', name: 'errorThreshold', type: 'number', dependsOn: new Set(['errorThreshold']) }
const itemRef:          CRefNode   = { kind: 'ref',   name: 'n',              type: 'number', dependsOn: new Set()                  }

// Body nodes — shared across streams: each apply() gets a fresh bodyScope so
// there is no cross-stream stale cache between Filter/Some calls.
const warnBody:  COperationNode = { kind: 'operation', op: 'GreaterThan', inputs: { a: itemRef, b: warnThreshInput  }, output: 'boolean', dependsOn: new Set(['warnThreshold'])  }
const errorBody: COperationNode = { kind: 'operation', op: 'GreaterThan', inputs: { a: itemRef, b: errorThreshInput }, output: 'boolean', dependsOn: new Set(['errorThreshold']) }

// ---------------------------------------------------------------------------
// Bindings shared between single program and split programs
// ---------------------------------------------------------------------------

const slowABinding:     CHigherOrderNode = { kind: 'higher_order', op: 'Filter', inputs: { list: streamAInput }, bindings: ['n'], body: warnBody,  dependsOn: new Set(['streamA', 'warnThreshold'])  }
const slowBBinding:     CHigherOrderNode = { kind: 'higher_order', op: 'Filter', inputs: { list: streamBInput }, bindings: ['n'], body: warnBody,  dependsOn: new Set(['streamB', 'warnThreshold'])  }
const slowCBinding:     CHigherOrderNode = { kind: 'higher_order', op: 'Filter', inputs: { list: streamCInput }, bindings: ['n'], body: warnBody,  dependsOn: new Set(['streamC', 'warnThreshold'])  }
const anyErrorABinding: CHigherOrderNode = { kind: 'higher_order', op: 'Some',   inputs: { list: streamAInput }, bindings: ['n'], body: errorBody, dependsOn: new Set(['streamA', 'errorThreshold']) }
const anyErrorBBinding: CHigherOrderNode = { kind: 'higher_order', op: 'Some',   inputs: { list: streamBInput }, bindings: ['n'], body: errorBody, dependsOn: new Set(['streamB', 'errorThreshold']) }
const anyErrorCBinding: CHigherOrderNode = { kind: 'higher_order', op: 'Some',   inputs: { list: streamCInput }, bindings: ['n'], body: errorBody, dependsOn: new Set(['streamC', 'errorThreshold']) }

// ---------------------------------------------------------------------------
// Program — single program for run() and ProgramRunner
//
// Set slowA          = Filter(streamA, n => GreaterThan(n, warnThreshold))
// Set slowB          = Filter(streamB, n => GreaterThan(n, warnThreshold))
// Set slowC          = Filter(streamC, n => GreaterThan(n, warnThreshold))
// Set anyErrorA      = Some(streamA,   n => GreaterThan(n, errorThreshold))
// Set anyErrorB      = Some(streamB,   n => GreaterThan(n, errorThreshold))
// Set anyErrorC      = Some(streamC,   n => GreaterThan(n, errorThreshold))
// Set systemCritical = Or(anyErrorA, anyErrorB, anyErrorC)
// ---------------------------------------------------------------------------

// RefNodes for systemCritical — dependsOn mirrors the binding they reference
const anyErrorARef: CRefNode = { kind: 'ref', name: 'anyErrorA', type: 'boolean', dependsOn: new Set(['streamA', 'errorThreshold']) }
const anyErrorBRef: CRefNode = { kind: 'ref', name: 'anyErrorB', type: 'boolean', dependsOn: new Set(['streamB', 'errorThreshold']) }
const anyErrorCRef: CRefNode = { kind: 'ref', name: 'anyErrorC', type: 'boolean', dependsOn: new Set(['streamC', 'errorThreshold']) }

const systemCriticalBinding: COperationNode = {
  kind: 'operation', op: 'Or',
  inputs: { nodes: [anyErrorARef, anyErrorBRef, anyErrorCRef] },
  output: 'boolean',
  dependsOn: new Set(['streamA', 'streamB', 'streamC', 'errorThreshold']),
}

export const program: CoreProgram = {
  bindings: new Map([
    ['slowA',          slowABinding],
    ['slowB',          slowBBinding],
    ['slowC',          slowCBinding],
    ['anyErrorA',      anyErrorABinding],
    ['anyErrorB',      anyErrorBBinding],
    ['anyErrorC',      anyErrorCBinding],
    ['systemCritical', systemCriticalBinding],
  ]),
  outputs: new Map([
    ['slowA',          { kind: 'ref', name: 'slowA',          type: 'any',     dependsOn: new Set(['streamA', 'warnThreshold'])                                    } as CRefNode],
    ['slowB',          { kind: 'ref', name: 'slowB',          type: 'any',     dependsOn: new Set(['streamB', 'warnThreshold'])                                    } as CRefNode],
    ['slowC',          { kind: 'ref', name: 'slowC',          type: 'any',     dependsOn: new Set(['streamC', 'warnThreshold'])                                    } as CRefNode],
    ['anyErrorA',      { kind: 'ref', name: 'anyErrorA',      type: 'boolean', dependsOn: new Set(['streamA', 'errorThreshold'])                                   } as CRefNode],
    ['anyErrorB',      { kind: 'ref', name: 'anyErrorB',      type: 'boolean', dependsOn: new Set(['streamB', 'errorThreshold'])                                   } as CRefNode],
    ['anyErrorC',      { kind: 'ref', name: 'anyErrorC',      type: 'boolean', dependsOn: new Set(['streamC', 'errorThreshold'])                                   } as CRefNode],
    ['systemCritical', { kind: 'ref', name: 'systemCritical', type: 'boolean', dependsOn: new Set(['streamA', 'streamB', 'streamC', 'errorThreshold'])             } as CRefNode],
  ]),
}

// ---------------------------------------------------------------------------
// Programs — split by threshold dependency for Runtime
//
// 'slowOps'  dependsOn: streams + warnThreshold  (Filters only)
// 'errorOps' dependsOn: streams + errorThreshold (Somes + Or)
//
// warnThreshold change  → inputIndex routes to 'slowOps' only
// errorThreshold change → inputIndex routes to 'errorOps' only
// stream change         → both programs run, but only that stream's nodes recompute
// ---------------------------------------------------------------------------

export const slowOpsProgram: CoreProgram = {
  bindings: new Map([
    ['slowA', slowABinding],
    ['slowB', slowBBinding],
    ['slowC', slowCBinding],
  ]),
  outputs: new Map([
    ['slowA', { kind: 'ref', name: 'slowA', type: 'any', dependsOn: new Set(['streamA', 'warnThreshold']) } as CRefNode],
    ['slowB', { kind: 'ref', name: 'slowB', type: 'any', dependsOn: new Set(['streamB', 'warnThreshold']) } as CRefNode],
    ['slowC', { kind: 'ref', name: 'slowC', type: 'any', dependsOn: new Set(['streamC', 'warnThreshold']) } as CRefNode],
  ]),
}

// errorOps needs its own RefNodes and systemCritical binding (can't share across programs)
const anyErrorARefE: CRefNode = { kind: 'ref', name: 'anyErrorA', type: 'boolean', dependsOn: new Set(['streamA', 'errorThreshold']) }
const anyErrorBRefE: CRefNode = { kind: 'ref', name: 'anyErrorB', type: 'boolean', dependsOn: new Set(['streamB', 'errorThreshold']) }
const anyErrorCRefE: CRefNode = { kind: 'ref', name: 'anyErrorC', type: 'boolean', dependsOn: new Set(['streamC', 'errorThreshold']) }
const systemCriticalBindingE: COperationNode = {
  kind: 'operation', op: 'Or',
  inputs: { nodes: [anyErrorARefE, anyErrorBRefE, anyErrorCRefE] },
  output: 'boolean',
  dependsOn: new Set(['streamA', 'streamB', 'streamC', 'errorThreshold']),
}

export const errorOpsProgram: CoreProgram = {
  bindings: new Map([
    ['anyErrorA',      anyErrorABinding],
    ['anyErrorB',      anyErrorBBinding],
    ['anyErrorC',      anyErrorCBinding],
    ['systemCritical', systemCriticalBindingE],
  ]),
  outputs: new Map([
    ['anyErrorA',      { kind: 'ref', name: 'anyErrorA',      type: 'boolean', dependsOn: new Set(['streamA', 'errorThreshold'])                        } as CRefNode],
    ['anyErrorB',      { kind: 'ref', name: 'anyErrorB',      type: 'boolean', dependsOn: new Set(['streamB', 'errorThreshold'])                        } as CRefNode],
    ['anyErrorC',      { kind: 'ref', name: 'anyErrorC',      type: 'boolean', dependsOn: new Set(['streamC', 'errorThreshold'])                        } as CRefNode],
    ['systemCritical', { kind: 'ref', name: 'systemCritical', type: 'boolean', dependsOn: new Set(['streamA', 'streamB', 'streamC', 'errorThreshold'])  } as CRefNode],
  ]),
}

// ---------------------------------------------------------------------------
// Scenarios
//
// Items are in range 1–200. errorThreshold starts at 200 so anyError iterates
// the full stream before returning false (no short-circuit, maximum compute).
// When errorThreshold drops to 180, anyError short-circuits after ~200 items,
// making the cached Filters represent an enormous amount of saved work.
//
// Streams are pre-allocated so delta() can detect unchanged streams by reference.
// ---------------------------------------------------------------------------

export type Scenario = {
  label:          string
  streamA:        number[]
  streamB:        number[]
  streamC:        number[]
  warnThreshold:  number
  errorThreshold: number
}

function makeStream(size: number, seed: number): number[] {
  return Array.from({ length: size }, (_, i) => ((i * seed) % 200) + 1)
}

const sA  = makeStream(300_000, 7)
const sA2 = makeStream(300_000, 17)
const sB  = makeStream(300_000, 11)
const sB2 = makeStream(300_000, 19)
const sC  = makeStream(300_000, 13)
const sC2 = makeStream(300_000, 23)

export const scenarios: Scenario[] = [
  // Initial: all 7 bindings compute (3 Filters + 3 Somes-full + Or)
  { label: 'initial',         streamA: sA,  streamB: sB,  streamC: sC,  warnThreshold: 100, errorThreshold: 200 },

  // warn only: 3 Filters recompute; 3 Somes + Or cached/skipped
  { label: 'warn ↑ 130',      streamA: sA,  streamB: sB,  streamC: sC,  warnThreshold: 130, errorThreshold: 200 },

  // streamA refresh: A's Filter + Some recompute; B+C fully cached
  { label: 'streamA refresh', streamA: sA2, streamB: sB,  streamC: sC,  warnThreshold: 130, errorThreshold: 200 },

  // warn only again: same pattern, confirms repeatability
  { label: 'warn ↑ 160',      streamA: sA2, streamB: sB,  streamC: sC,  warnThreshold: 160, errorThreshold: 200 },

  // error drops: anyError now short-circuits after ~200 items (items 181–200 trigger)
  // 3 Somes run (trivially fast); 3 Filters are cached/skipped (saved ~900k iterations)
  { label: 'error ↓ 180',     streamA: sA2, streamB: sB,  streamC: sC,  warnThreshold: 160, errorThreshold: 180 },

  // streams B+C refresh: A's nodes cached; B+C each recompute Filter + Some
  { label: 'streams B+C',     streamA: sA2, streamB: sB2, streamC: sC2, warnThreshold: 160, errorThreshold: 180 },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Which inputs changed between consecutive scenarios. */
export function changesFrom(prev: Scenario | undefined, curr: Scenario): string {
  if (!prev) return 'initial'
  const changed: string[] = []
  if (prev.streamA        !== curr.streamA)        changed.push('streamA')
  if (prev.streamB        !== curr.streamB)        changed.push('streamB')
  if (prev.streamC        !== curr.streamC)        changed.push('streamC')
  if (prev.warnThreshold  !== curr.warnThreshold)  changed.push('warn')
  if (prev.errorThreshold !== curr.errorThreshold) changed.push('error')
  return changed.length ? changed.join('+') : 'unchanged'
}

/** Changed inputs only — enables node-level and program-level caching. */
export function delta(prev: Scenario | undefined, curr: Scenario): Record<string, unknown> {
  const c: Record<string, unknown> = {}
  if (!prev || prev.streamA        !== curr.streamA)        c.streamA        = curr.streamA
  if (!prev || prev.streamB        !== curr.streamB)        c.streamB        = curr.streamB
  if (!prev || prev.streamC        !== curr.streamC)        c.streamC        = curr.streamC
  if (!prev || prev.warnThreshold  !== curr.warnThreshold)  c.warnThreshold  = curr.warnThreshold
  if (!prev || prev.errorThreshold !== curr.errorThreshold) c.errorThreshold = curr.errorThreshold
  return c
}

/** Scenario header line. */
export function logHeader(s: Scenario, note: string): void {
  console.log(`\n[${s.label}] 3×${s.streamA.length.toLocaleString()} items  warn=${s.warnThreshold}  error=${s.errorThreshold}  (${note})`)
}

/** Display outputs from a single program. */
export function display(outputs: Map<string, unknown>): void {
  const a = (outputs.get('slowA') as unknown[]).length
  const b = (outputs.get('slowB') as unknown[]).length
  const c = (outputs.get('slowC') as unknown[]).length
  console.log(`  slow:   A=${a.toLocaleString()} B=${b.toLocaleString()} C=${c.toLocaleString()} items`)
  console.log(`  errors: A=${outputs.get('anyErrorA')} B=${outputs.get('anyErrorB')} C=${outputs.get('anyErrorC')}`)
  console.log(`  crisis: ${outputs.get('systemCritical')}`)
}

/** Display split runtime outputs, noting which program was evaluated vs cached/skipped. */
export function displayRuntime(
  results:      Map<string, Map<string, unknown>>,
  lastSlowOps:  Map<string, unknown>,
  lastErrorOps: Map<string, unknown>,
): void {
  const slowRan  = results.has('slowOps')
  const errorRan = results.has('errorOps')
  const s = slowRan  ? results.get('slowOps')!  : lastSlowOps
  const e = errorRan ? results.get('errorOps')! : lastErrorOps

  const a = (s.get('slowA') as unknown[]).length
  const b = (s.get('slowB') as unknown[]).length
  const c = (s.get('slowC') as unknown[]).length
  console.log(`  slow:   A=${a.toLocaleString()} B=${b.toLocaleString()} C=${c.toLocaleString()} items${slowRan ? '' : '  ← slowOps not evaluated'}`)
  console.log(`  errors: A=${e.get('anyErrorA')} B=${e.get('anyErrorB')} C=${e.get('anyErrorC')}`)
  console.log(`  crisis: ${e.get('systemCritical')}${errorRan ? '' : '  ← errorOps not evaluated'}`)
}

/** Silent timer — returns result and duration in ms. */
export function time<T>(fn: () => T): { result: T; ms: number } {
  const t = performance.now()
  const result = fn()
  return { result, ms: performance.now() - t }
}

/** Logging timer. */
export function timed<T>(label: string, fn: () => T): T {
  const { result, ms } = time(fn)
  console.log(`  ⏱  ${label}: ${ms.toFixed(3)}ms`)
  return result
}
