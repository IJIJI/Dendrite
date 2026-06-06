/**
 * Heavy scenario — ProgramRunner style.
 *
 * delta() passes only changed inputs, so changedInputs is precise.
 * The single program's 7 bindings each have their own dependsOn — only those
 * intersecting changedInputs recompute.
 *
 * Key cache wins (compare timing against heavy.run.example):
 *   warn only       → 3 Somes + Or cached; only 3 Filters run          (~3×)
 *   single stream   → 4 bindings cached; only that stream's 2 ops run  (~3×)
 *   error ↓ 180     → 3 Filters cached; 3 Somes run (trivially fast)   (~50×+)
 */

import { createProgramRunner } from '../../src/language/runner'
import {
  descriptor, program,
  scenarios, changesFrom, delta,
  display, timed, logHeader,
  type Scenario,
} from './shared'

const runner = createProgramRunner(program, descriptor)
let prev: Scenario | undefined

for (const s of scenarios) {
  const changes = delta(prev, s)
  const what    = changesFrom(prev, s)

  const note = {
    'initial':         'initial — all 7 bindings compute',
    'warn':            'warn only — 3 Somes + Or cached',
    'error':           'error only — 3 Filters cached',
    'streamA':         'streamA — B+C bindings (4 of 7) cached',
    'streamB':         'streamB — A+C bindings cached',
    'streamC':         'streamC — A+B bindings cached',
    'streamB+streamC': 'streamB+streamC — A bindings (2 of 7) cached',
  }[what] ?? what

  logHeader(s, note)
  const outputs = timed('runner.run()', () => runner.run(changes))
  display(outputs)
  prev = s
}