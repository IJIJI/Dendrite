/**
 * Core language, using ProgramRunner.
 *
 * createProgramRunner() maintains EvalState across calls. delta() passes only
 * inputs that actually changed, so changedInputs is precise each run.
 *
 * Scenarios 5→6→7 (same 10k values, threshold rises) and 8→9 (same 100k)
 * produce changedInputs = {'threshold'}, anyCumLaude is returned from
 * nodeCache without iterating the list. Compare timing against core.run.example
 * and core.runtime.example.
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
  const note    = what === 'threshold only' ? `${what} - anyCumLaude cached` : what

  logHeader(s, note)
  const outputs = timed('runner.run()', () => runner.run(changes))
  display(outputs)
  prev = s
}