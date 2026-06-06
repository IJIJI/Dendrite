/**
 * Core language — runner examples.
 *
 * Demonstrates the two runtime-free execution paths:
 *   run(): one-shot, fresh state each time, ideal for unit tests
 *
 * Program: filter a list of numbers to those above a threshold.
 *
 *   Set passing = Filter(values, n => GreaterThan(n, threshold))
 *   Set hasAny  = Some(values,   n => GreaterThan(n, threshold))
 *   output passing = passing
 *   output hasAny  = hasAny
 *
 * In production this CoreProgram would come from the analyser.
 * Here it is hand-built so dependsOn values are shown explicitly.
 */

import { createCoreLanguage } from '../../src/language/core'
import { createProgramRunner } from '../../src/language/runner'
import { CoreProgram } from '../../src/language/program'
import {
  CInputNode,
  CRefNode,
  COperationNode,
  CHigherOrderNode,
} from '../../src/language/nodes'

// ---------------------------------------------------------------------------
// Timing helper
// ---------------------------------------------------------------------------
 
function timed<T>(label: string, fn: () => T): T {
  const t = performance.now()
  const result = fn()
  console.log(`  Runtime ${label}: ${(performance.now() - t).toFixed(3)}ms`)
  return result
}

// ---------------------------------------------------------------------------
// Language: Core extended with example inputs and outputs
// ---------------------------------------------------------------------------

const lang = createCoreLanguage()

lang.registerInput({ name: 'values',    type: 'any',    default: [] })
lang.registerInput({ name: 'threshold', type: 'number', default: 50 })

lang.registerOutput({ name: 'passing', type: 'any',     mode: 'required' })
lang.registerOutput({ name: 'hasAny',  type: 'boolean', mode: 'desired'  })

const { descriptor } = lang

// ---------------------------------------------------------------------------
// CoreProgram: hand-built (normally produced by the analyser).
// dependsOn values are shown explicitly to illustrate what the analyser computes.
// ---------------------------------------------------------------------------

const valuesInput: CInputNode = {
  kind: 'input', name: 'values', type: 'any',
  dependsOn: new Set(['values']),
}

const thresholdInput: CInputNode = {
  kind: 'input', name: 'threshold', type: 'number',
  dependsOn: new Set(['threshold']),
}

// Scoped item binding. Resolved from innerState.inputs inside apply().
// dependsOn is empty: item bindings are not context inputs and are not
// tracked in dependsOn (they change per apply call, not per input event).
const itemRef: CRefNode = {
  kind: 'ref', name: 'n', type: 'number',
  dependsOn: new Set(),
}

// Separate body nodes for Filter and Some. Same structure but distinct objects
// so their bodyScope cache entries don't interfere across apply() calls.
const filterBody: COperationNode = {
  kind: 'operation', op: 'GreaterThan',
  inputs: { a: itemRef, b: thresholdInput },
  output: 'boolean',
  dependsOn: new Set(['threshold']),   // n is scoped, threshold is a context input
}

const someBody: COperationNode = {
  kind: 'operation', op: 'GreaterThan',
  inputs: { a: itemRef, b: thresholdInput },
  output: 'boolean',
  dependsOn: new Set(['threshold']),
}

// passing = Filter(values, n => GreaterThan(n, threshold))
const passingBinding: CHigherOrderNode = {
  kind: 'higher_order', op: 'Filter',
  inputs: { list: valuesInput },
  bindings: ['n'],
  body: filterBody,
  dependsOn: new Set(['values', 'threshold']),
}

// hasAny = Some(values, n => GreaterThan(n, threshold))
const hasAnyBinding: CHigherOrderNode = {
  kind: 'higher_order', op: 'Some',
  inputs: { list: valuesInput },
  bindings: ['n'],
  body: someBody,
  dependsOn: new Set(['values', 'threshold']),
}

// Output refs — dependsOn mirrors the binding they reference
const passingOutput: CRefNode = {
  kind: 'ref', name: 'passing', type: 'any',
  dependsOn: new Set(['values', 'threshold']),
}

const hasAnyOutput: CRefNode = {
  kind: 'ref', name: 'hasAny', type: 'boolean',
  dependsOn: new Set(['values', 'threshold']),
}

const program: CoreProgram = {
  bindings: new Map([
    ['passing', passingBinding],
    ['hasAny',  hasAnyBinding],
  ]),
  outputs: new Map([
    ['passing', passingOutput],
    ['hasAny',  hasAnyOutput],
  ]),
}

// ---------------------------------------------------------------------------
// createProgramRunner(): stateful evaluation with caching.
//
// Initialises inputs from descriptor defaults on construction.
// Each run() call only recomputes nodes whose dependsOn intersects changedInputs.
// Unchanged nodes return their cached value from the previous run.
// ---------------------------------------------------------------------------
 
const runner = createProgramRunner(program, descriptor)
 
// First run — nodeCache is empty, everything computes regardless of changedInputs
const s1 = timed('runner.run() — first, full compute', () =>
  runner.run({ values: [45, 67, 82, 23, 91], threshold: 60 })
)
console.log('  passing:', s1.get('passing'))  // [67, 82, 91]
console.log('  hasAny: ', s1.get('hasAny'))   // true
 
// threshold changed — nodes depending only on values are returned from cache.
// passingBinding.dependsOn includes 'threshold' → recomputes.
const s2 = timed('runner.run() — threshold → 80 (values cached)', () =>
  runner.run({ threshold: 80 })
)
console.log('  passing:', s2.get('passing'))  // [82, 91]
console.log('  hasAny: ', s2.get('hasAny'))   // true
 
// values changed — threshold (now 80) remains cached, list recomputed.
const s3 = timed('runner.run() — values changed (threshold cached)', () =>
  runner.run({ values: [30, 55, 95, 85] })
)
console.log('  passing:', s3.get('passing'))  // [95, 85]
console.log('  hasAny: ', s3.get('hasAny'))   // true
 
// Both changed — everything recomputes.
const s4 = timed('runner.run() — values + threshold, full recompute', () =>
  runner.run({ values: [10, 20], threshold: 50 })
)
console.log('  passing:', s4.get('passing'))  // []
console.log('  hasAny: ', s4.get('hasAny'))   // false