//? run: one-shot evaluation for simple scripting and testing.
//
//  Creates fresh state, sets the provided inputs, and evaluates immediately.
//  No caching benefit across calls, each call starts from scratch.
//  changedInputs is not required since there is no prior state to diff against.
//
//  Example:
//    const outputs = run(program, descriptor, { sourceBusNew: bus }, hostContext)

import { CoreProgram, createEvalState, evaluateProgram, updateInput } from "./program"
import { LanguageDescriptor } from "./registry"

//    expect(outputs.get('tally')).toBe('program')
export function run(
  program: CoreProgram,
  descriptor: LanguageDescriptor,
  inputs: Record<string, unknown>,
  hostContext?: unknown,
): Map<string, unknown> {
  const state = createEvalState()
  for (const [name, value] of Object.entries(inputs)) {
    updateInput(name, value, state)
  }
  return evaluateProgram(program, state, descriptor, undefined, hostContext)
}
 