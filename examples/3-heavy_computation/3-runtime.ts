/**
 * Heavy scenario — Runtime style.
 *
 * Two programs split at the threshold dependency boundary:
 *   'slowOps'   — 3 Filters  — dependsOn: streams + warnThreshold
 *   'errorOps'  — 3 Somes+Or — dependsOn: streams + errorThreshold
 *
 * The inputIndex routes each change to only the affected program:
 *   warn only   → slowOps runs,  errorOps NOT EVALUATED  (~3×)
 *   error only  → errorOps runs, slowOps NOT EVALUATED   (~50×+)
 *   stream change → both run, but only that stream's nodes recompute (~3×)
 *
 * The '← not evaluated' annotation in output shows when a program was skipped.
 */

import { createRuntime } from '../../src/language/runtime'
import {
  descriptor, slowOpsProgram, errorOpsProgram,
  scenarios, changesFrom, delta,
  displayRuntime, timed, logHeader,
  type Scenario,
} from './shared'

const runtime  = createRuntime(descriptor)
const slowOps  = timed('register slowOps',  () => runtime.register('slowOps',  slowOpsProgram))
const errorOps = timed('register errorOps', () => runtime.register('errorOps', errorOpsProgram))

let prev: Scenario | undefined
let lastSlowOps  = slowOps.initialOutputs
let lastErrorOps = errorOps.initialOutputs

for (const s of scenarios) {
  const changes = delta(prev, s)
  const what    = changesFrom(prev, s)

  const note = {
    'initial':         'initial — both programs compute',
    'warn':            'warn only → slowOps runs, errorOps skipped',
    'error':           'error only → errorOps runs, slowOps skipped',
    'streamA':         'streamA → both run, B+C nodes cached within each',
    'streamB':         'streamB → both run, A+C nodes cached within each',
    'streamC':         'streamC → both run, A+B nodes cached within each',
    'streamB+streamC': 'streamB+streamC → both run, A nodes cached within each',
  }[what] ?? what

  logHeader(s, note)
  const results = timed('updateInputs()', () => runtime.updateInputs(changes))
  if (results.has('slowOps'))  lastSlowOps  = results.get('slowOps')!
  if (results.has('errorOps')) lastErrorOps = results.get('errorOps')!
  displayRuntime(results, lastSlowOps, lastErrorOps)
  prev = s
}

slowOps.unregister()
errorOps.unregister()