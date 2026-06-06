/**
 * Heavy scenario — run() style.
 *
 * Every scenario recomputes all 7 bindings from scratch: 3 Filters + 3 Somes + Or.
 * Note the 'error ↓ 180' scenario — anyError now short-circuits after ~200 items,
 * so run() still completes quickly. But compare it against runner and runtime,
 * where the 3 expensive Filters are cached and only the trivial Somes run.
 */

import { run } from '../../src/language/runner'
import {
  descriptor, program,
  scenarios, changesFrom,
  display, timed, logHeader,
  type Scenario,
} from './shared'

for (let i = 0; i < scenarios.length; i++) {
  const s    = scenarios[i]
  const prev = scenarios[i - 1] as Scenario | undefined
  const what = changesFrom(prev, s)
  const note = what === 'initial' ? what : `${what} — run() recomputes all 7 bindings`

  logHeader(s, note)
  const outputs = timed('run()', () =>
    run(program, descriptor, { streamA: s.streamA, streamB: s.streamB, streamC: s.streamC, warnThreshold: s.warnThreshold, errorThreshold: s.errorThreshold })
  )
  display(outputs)
}