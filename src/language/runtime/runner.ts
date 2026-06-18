import { CoreProgram, createEvalState, evaluateProgram, updateInput } from "../program";
import { LanguageDescriptor } from "../registry";

// runner.ts — single-program convenience API.
//
// Sits between the evaluation primitives in program.ts and the full reactive
// multi-program system in runtime.ts:
//
//   program.ts  — evaluation primitives (evaluate, evaluateProgram, EvalState)
//   runner.ts   — single-program convenience API  ← you are here
//   runtime.ts  — multi-program reactive system (createRuntime, ProgramHandle)

//? run: one-shot evaluation for simple scripting and testing.
//
//  Creates fresh state, sets the provided inputs, and evaluates immediately.
//  No caching benefit across calls, each call starts from scratch.
//  changedInputs is not required since there is no prior state to diff against.
//
//  Example:
//    const outputs = run(program, descriptor, { sourceBusNew: bus }, hostContext)
//    expect(outputs.get('tally')).toBe('program')
export function run(
  program: CoreProgram,
  descriptor: LanguageDescriptor,
  inputs: Record<string, unknown>,
  hostContext?: unknown,
): Map<string, unknown> {
  const state = createEvalState();
  for (const [name, value] of Object.entries(inputs)) {
    updateInput(name, value, state);
  }
  return evaluateProgram(program, state, descriptor, undefined, hostContext);
}

//? ProgramRunner: stateful single-program evaluator without a full Runtime.
//
//  Used for single program evaluation, when you want caching across evaluations and default initialisation,
//  but don't need subscriptions, multi-program routing, or trigger lifecycle.
//
//  Inputs are initialised from descriptor defaults on construction, so only
//  the inputs that actually change need to be passed to each run() call.
//  The nodeCache carries over between calls — only nodes whose dependsOn
//  intersects changedInputs are recomputed.
//
//  Example:
//   const runner = createProgramRunner(program, descriptor, hostContext)
//   runner.run({ sourceBusNew: bus1 })  // computes everything (fresh cache)
//   runner.run({ sourceBusNew: bus2 })  // only recomputes affected nodes
// ---------------------------------------------------------------------------

export interface ProgramRunner {
  /**
   * Apply input changes and evaluate. Only nodes whose dependsOn intersects
   * the changed keys are recomputed. All other nodes return their cached value.
   */
  run(changes: Record<string, unknown>): Map<string, unknown>;
}

export function createProgramRunner(
  program: CoreProgram,
  descriptor: LanguageDescriptor,
  hostContext?: unknown,
): ProgramRunner {
  const state = createEvalState();

  // Initialise all registered inputs from descriptor defaults —
  // same behaviour as Runtime.register, prevents input_not_set errors
  for (const [name, def] of descriptor.inputs) {
    updateInput(name, def.default ?? null, state);
  }

  return {
    run(changes) {
      const changedInputs = new Set(Object.keys(changes));
      for (const [name, value] of Object.entries(changes)) {
        updateInput(name, value, state);
      }
      return evaluateProgram(program, state, descriptor, changedInputs, hostContext);
    },
  };
}
