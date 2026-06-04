import { type LanguageDescriptor } from './registry'
import {
  type CoreProgram,
  type EvalState,
  createEvalState,
  initializeProgram,
  updateInput,
  evaluateProgram,
} from './program'

// ---------------------------------------------------------------------------
// Runtime - library-level manager for multiple programs sharing inputs.
//
// When an input changes, the Runtime finds every registered program that
// depends on it (via outputDependencies) and re-evaluates only those.
// ---------------------------------------------------------------------------

export type OutputHandler = (
  programId: string,
  outputs: Map<string, unknown>,
) => void

interface ProgramEntry {
  id: string
  program: CoreProgram
  state: EvalState
}

export interface Runtime {
  /** Register a program. Creates EvalState and runs initial evaluation. */
  register(id: string, program: CoreProgram): Map<string, unknown>

  /** Unregister a program and clean up its state. */
  unregister(id: string): void

  /**
   * Update a shared input and re-evaluate all affected programs.
   * Returns a map of programId → outputs for every program that re-ran.
   */
  updateInput(name: string, value: unknown): Map<string, Map<string, unknown>>

  /**
   * Fire a trigger - sets the value, evaluates all affected programs,
   * then resets to the trigger's default value.
   */
  fireTrigger(name: string, value: unknown): Map<string, Map<string, unknown>>

  /** Subscribe to output changes. Returns an unsubscribe function. */
  onOutput(handler: OutputHandler): () => void

  /**
   * Per-output contributing inputs for a registered program.
   * Useful for host tooling and change listener setup.
   */
  getOutputDependencies(programId: string): Map<string, Set<string>> | undefined
}

export function createRuntime(
  descriptor: LanguageDescriptor,
  hostContext?: unknown,
): Runtime {
  const programs = new Map<string, ProgramEntry>()
  const handlers = new Set<OutputHandler>()

  /**
   * inputIndex - input name → Set of program IDs that depend on it.
   * Built incrementally as programs are registered/unregistered.
   * Avoids scanning all programs on every input change.
   */
  const inputIndex = new Map<string, Set<string>>()

  function addToIndex(id: string, program: CoreProgram): void {
    for (const inputSet of program.outputDependencies.values()) {
      for (const inputName of inputSet) {
        if (!inputIndex.has(inputName)) {
          inputIndex.set(inputName, new Set())
        }
        inputIndex.get(inputName)!.add(id)
      }
    }
  }

  function removeFromIndex(id: string, program: CoreProgram): void {
    for (const inputSet of program.outputDependencies.values()) {
      for (const inputName of inputSet) {
        inputIndex.get(inputName)?.delete(id)
      }
    }
  }

  function notify(id: string, outputs: Map<string, unknown>): void {
    for (const handler of handlers) {
      handler(id, outputs)
    }
  }

  function runAffected(
    name: string,
    value: unknown,
  ): Map<string, Map<string, unknown>> {
    const results = new Map<string, Map<string, unknown>>()
    const affected = inputIndex.get(name) ?? new Set()

    for (const programId of affected) {
      const entry = programs.get(programId)!
      updateInput(name, value, entry.state, entry.program)
      const outputs = evaluateProgram(entry.program, entry.state, descriptor, hostContext)
      results.set(programId, outputs)
      notify(programId, outputs)
    }

    return results
  }

  return {
    register(id, program) {
      const state = createEvalState()
      initializeProgram(program, state)
      programs.set(id, { id, program, state })
      addToIndex(id, program)

      const outputs = evaluateProgram(program, state, descriptor, hostContext)
      notify(id, outputs)
      return outputs
    },

    unregister(id) {
      const entry = programs.get(id)
      if (!entry) return
      removeFromIndex(id, entry.program)
      programs.delete(id)
    },

    updateInput(name, value) {
      return runAffected(name, value)
    },

    fireTrigger(name, value) {
      const results = runAffected(name, value)
      const defaultValue = descriptor.inputs.get(name)?.default ?? null
      runAffected(name, defaultValue)
      return results
    },

    onOutput(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },

    getOutputDependencies(programId) {
      return programs.get(programId)?.program.outputDependencies
    },
  }
}