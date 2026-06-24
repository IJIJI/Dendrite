import {
  createEvalState,
  evaluateProgram,
  outputDependencies,
  updateInput,
} from "../evaluator/evaluator";
import { EvalError, EvalState } from "../evaluator/types";
import { CoreProgram } from "../infra/program";
import { type LanguageDescriptor } from "../infra/registry";

// ---------------------------------------------------------------------------
// ProgramHandle - returned by register(), scoped to one program.
//
// Provides subscriptions and unregistration for a specific program without
// the consumer needing to track or repeat the program ID.
// Unregister clears all per-program handlers and removes the program from
// the runtime index - no dangling handlers can fire after unregistration.
// ---------------------------------------------------------------------------
export interface ProgramHandle {
  readonly id: string;

  /**
   * Outputs from the first evaluation, available immediately after register().
   * Subsequent changes arrive via onOutput().
   */
  readonly initialOutputs: Map<string, unknown>;

  /** Subscribe to output changes for this program. Returns an unsubscribe function. */
  onOutput(handler: (outputs: Map<string, unknown>) => void): () => void;

  /** Subscribe to evaluation errors for this program. Returns an unsubscribe function. */
  onError(handler: (error: EvalError) => void): () => void;

  /** Unregister the program and clear all its subscriptions. */
  unregister(): void;
}

// ---------------------------------------------------------------------------
// Global handler types - fired for every program, includes programId.
// Useful for dashboards, loggers, or anything that observes all programs.
// ---------------------------------------------------------------------------

export type OutputHandler = (programId: string, outputs: Map<string, unknown>) => void;
export type ErrorHandler = (programId: string, error: EvalError) => void;

// ---------------------------------------------------------------------------
// Runtime - manages multiple programs sharing context inputs.
// ---------------------------------------------------------------------------

interface ProgramEntry {
  id: string;
  program: CoreProgram;
  state: EvalState;
  outputHandlers: Set<(outputs: Map<string, unknown>) => void>;
  errorHandlers: Set<(error: EvalError) => void>;
}

export interface Runtime {
  /**
   * Register a program. Initialises inputs to defaults, runs first evaluation,
   * and returns a ProgramHandle for program-scoped subscriptions.
   */
  register(id: string, program: CoreProgram): ProgramHandle;

  /**
   * Unregister by ID - for cases where the handle is unavailable.
   * Clears all per-program handlers. Prefer handle.unregister() when possible.
   */
  unregister(id: string): void;

  /** Update a single input and re-evaluate all affected programs. */
  updateInput(name: string, value: unknown): Map<string, Map<string, unknown>>;

  /**
   * Update multiple inputs atomically - one evaluation pass per program.
   * Preferred over multiple updateInput calls for the same ATEM event.
   */
  updateInputs(changes: Record<string, unknown>): Map<string, Map<string, unknown>>;

  /**
   * Fire a trigger - sets the value, evaluates affected programs,
   * then resets to the trigger's default value.
   */
  fireTrigger(name: string, value: unknown): Map<string, Map<string, unknown>>;

  /**
   * Subscribe to output changes for ALL programs. Returns an unsubscribe function.
   * For program-specific subscriptions, use handle.onOutput() instead.
   */
  onOutput(handler: OutputHandler): () => void;

  /**
   * Subscribe to evaluation errors for ALL programs. Returns an unsubscribe function.
   * For program-specific subscriptions, use handle.onError() instead.
   */
  onError(handler: ErrorHandler): () => void;

  /**
   * Contributing inputs for each output of a registered program.
   * Derived from output CNode.dependsOn - no separate map needed.
   */
  getOutputDependencies(programId: string): Map<string, ReadonlySet<string>> | undefined;
}

export function createRuntime(descriptor: LanguageDescriptor, hostContext?: unknown): Runtime {
  const programs = new Map<string, ProgramEntry>();

  // Global handler sets - fire for every program, include programId
  const globalOutputHandlers = new Set<OutputHandler>();
  const globalErrorHandlers = new Set<ErrorHandler>();

  // inputIndex - input name → program IDs whose outputs depend on it
  const inputIndex = new Map<string, Set<string>>();

  // currentInputs - tracks the live value of every input set since runtime creation.
  // Used to seed programs registered after inputs have already been updated.
  const currentInputs = new Map<string, unknown>();

  function addToIndex(id: string, program: CoreProgram): void {
    for (const outputNode of program.outputs.values()) {
      for (const inputName of outputNode.dependsOn) {
        if (!inputIndex.has(inputName)) inputIndex.set(inputName, new Set());
        inputIndex.get(inputName)!.add(id);
      }
    }
  }

  function removeFromIndex(id: string, program: CoreProgram): void {
    for (const outputNode of program.outputs.values()) {
      for (const inputName of outputNode.dependsOn) {
        inputIndex.get(inputName)?.delete(id);
      }
    }
  }

  function notifyOutput(id: string, outputs: Map<string, unknown>): void {
    for (const handler of globalOutputHandlers) handler(id, outputs);
    const entry = programs.get(id);
    if (entry) {
      for (const handler of entry.outputHandlers) handler(outputs);
    }
  }

  function notifyError(id: string, error: EvalError): void {
    for (const handler of globalErrorHandlers) handler(id, error);
    const entry = programs.get(id);
    if (entry) {
      for (const handler of entry.errorHandlers) handler(error);
    }
  }

  function applyChanges(changes: Map<string, unknown>): Map<string, Map<string, unknown>> {
    const changedInputs = new Set(changes.keys());

    const affected = new Set<string>();
    for (const name of changedInputs) {
      for (const id of inputIndex.get(name) ?? []) affected.add(id);
    }

    for (const [name, value] of changes) {
      currentInputs.set(name, value);
      for (const id of affected) {
        updateInput(name, value, programs.get(id)!.state);
      }
    }

    const results = new Map<string, Map<string, unknown>>();
    for (const id of affected) {
      const entry = programs.get(id)!;
      try {
        const outputs = evaluateProgram(
          entry.program,
          entry.state,
          descriptor,
          changedInputs,
          hostContext,
        );
        results.set(id, outputs);
        notifyOutput(id, outputs);
      } catch (e) {
        if (e instanceof EvalError) {
          notifyError(id, e);
        } else {
          throw e;
        }
      }
    }

    return results;
  }

  function doUnregister(id: string): void {
    const entry = programs.get(id);
    if (!entry) return;
    entry.outputHandlers.clear();
    entry.errorHandlers.clear();
    removeFromIndex(id, entry.program);
    programs.delete(id);
  }

  return {
    register(id, program) {
      const state = createEvalState();
      const outputHandlers = new Set<(outputs: Map<string, unknown>) => void>();
      const errorHandlers = new Set<(error: EvalError) => void>();

      programs.set(id, { id, program, state, outputHandlers, errorHandlers });
      addToIndex(id, program);

      for (const [name, def] of descriptor.inputs) {
        updateInput(name, def.default ?? null, state);
      }
      // Overlay with any values already set at runtime since creation
      for (const [name, value] of currentInputs) {
        updateInput(name, value, state);
      }

      const changedInputs = new Set(descriptor.inputs.keys());
      const initialOutputs = evaluateProgram(
        program,
        state,
        descriptor,
        changedInputs,
        hostContext,
      );
      notifyOutput(id, initialOutputs);

      return {
        id,
        initialOutputs,
        onOutput(handler) {
          outputHandlers.add(handler);
          return () => outputHandlers.delete(handler);
        },
        onError(handler) {
          errorHandlers.add(handler);
          return () => errorHandlers.delete(handler);
        },
        unregister() {
          doUnregister(id);
        },
      };
    },

    unregister(id) {
      doUnregister(id);
    },

    updateInput(name, value) {
      return applyChanges(new Map([[name, value]]));
    },

    updateInputs(changes) {
      return applyChanges(new Map(Object.entries(changes)));
    },

    fireTrigger(name, value) {
      const results = applyChanges(new Map([[name, value]]));
      const defaultValue = descriptor.inputs.get(name)?.default ?? null;
      applyChanges(new Map([[name, defaultValue]]));
      return results;
    },

    onOutput(handler) {
      globalOutputHandlers.add(handler);
      return () => globalOutputHandlers.delete(handler);
    },

    onError(handler) {
      globalErrorHandlers.add(handler);
      return () => globalErrorHandlers.delete(handler);
    },

    getOutputDependencies(programId) {
      const entry = programs.get(programId);
      return entry ? outputDependencies(entry.program) : undefined;
    },
  };
}
