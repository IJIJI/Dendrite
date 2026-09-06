import { composeLayers, type PortProblem } from "../compose";
import { outputDependencies } from "../evaluator/evaluator";
import { EvalError } from "../evaluator/types";
import { EMPTY_PORTS, type PortLayer, type Ports, Policy } from "../infra/ports";
import { type CoreProgram } from "../infra/program";
import { type InputDefinition, type LanguageDescriptor } from "../infra/registry";
import { type BoundProgram, ProgramEntry } from "./entry";
import { defaultValueFor } from "./seed";

// ---------------------------------------------------------------------------
// Runtime - many programs over one language and one set of GLOBAL port layers.
//
// Two levels of ports meet here:
//   global  - the runtime's own layers (a host contract, a capability). One value per
//             name for every program; the host pushes them with updateInputs.
//   program - what one registered program declares on top (its document layer). Values
//             live with that program alone; the host pushes them through its handle.
// Both levels compose per entry, so a program-layer type resolves when its inputs seed.
// Compose problems here are configuration bugs (an instance checks its layers first and
// reports them as diagnostics), so register and replace throw on them.
// ---------------------------------------------------------------------------

/** Program-scoped subscriptions and input pushes, so callers need not repeat the id. */
export interface ProgramHandle {
  readonly id: string;

  /**
   * Outputs from the first evaluation, available immediately after register().
   * Empty when that evaluation failed - the error reaches onError handlers.
   * Subsequent changes arrive via onOutput().
   */
  readonly initialOutputs: Map<string, unknown>;

  /** Subscribe to output changes for this program. Returns an unsubscribe function. */
  onOutput(handler: (outputs: Map<string, unknown>) => void): () => void;

  /** Subscribe to evaluation errors for this program. Returns an unsubscribe function. */
  onError(handler: (error: EvalError) => void): () => void;

  /** Set one PROGRAM-level input and re-evaluate this program. Throws on a global name. */
  setInput(name: string, value: unknown): Map<string, unknown>;

  /**
   * Fire a program-level trigger: set, evaluate, then reset to the input's default and
   * evaluate again. The returned outputs are the fired pass.
   */
  fireTrigger(name: string, value: unknown): Map<string, unknown>;

  /** Unregister the program and clear all its subscriptions. */
  unregister(): void;
}

// ---------------------------------------------------------------------------
// Global handler types - fired for every program, includes programId.
// Useful for dashboards, loggers, or anything that observes all programs.
// ---------------------------------------------------------------------------

export type OutputHandler = (programId: string, outputs: Map<string, unknown>) => void;
export type ErrorHandler = (programId: string, error: EvalError) => void;

export interface RuntimeOptions {
  /** Global port layers, in precedence order: an earlier layer owns a contested name. */
  layers?: readonly PortLayer[];
}

export interface RegisterOptions {
  /** What this program declares on top of the global layers. */
  ports?: Ports;
  /** Starting values for its program-level inputs; other names are ignored. */
  values?: Readonly<Record<string, unknown>>;
}

export interface Runtime {
  /** The global layers, in precedence order. */
  readonly layers: readonly PortLayer[];

  /**
   * Replace one global layer's ports. Returns the compose problems that made the change
   * impossible (nothing changed), or an empty list once applied. Unknown id throws.
   * Values of names the layer dropped are pruned; listeners are notified last.
   *
   * Already-registered programs keep evaluating as they are: a program-level name that a
   * new global layer also declares is only re-checked when that program is replaced.
   */
  setLayer(id: string, ports: Ports): PortProblem[];

  /** Subscribe to global layer changes (an instance recompiles on these). */
  onLayerChange(listener: (layers: readonly PortLayer[]) => void): () => void;

  /**
   * Register a program: compose its ports, seed its inputs, run the first evaluation and
   * return a handle. Throws on compose problems or an id that is already registered.
   */
  register(id: string, program: CoreProgram, options?: RegisterOptions): ProgramHandle;

  /**
   * Swap the program behind an id, keeping its subscriptions and the values of every
   * program-level input it still declares. Omitting `ports` keeps the current ones.
   */
  replace(
    id: string,
    program: CoreProgram,
    options?: Pick<RegisterOptions, "ports">,
  ): ProgramHandle;

  /**
   * Unregister by ID - for cases where the handle is unavailable.
   * Clears all per-program handlers. Prefer handle.unregister() when possible.
   */
  unregister(id: string): void;

  /** Update a single global input and re-evaluate all affected programs. */
  updateInput(name: string, value: unknown): Map<string, Map<string, unknown>>;

  /**
   * Update multiple global inputs atomically - one evaluation pass per program.
   * Preferred over multiple updateInput calls for the same ATEM event.
   * Names that are not declared globally are ignored.
   */
  updateInputs(changes: Record<string, unknown>): Map<string, Map<string, unknown>>;

  /**
   * Fire a global trigger - sets the value, evaluates affected programs,
   * then resets to the input's default value.
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

export function createRuntime(base: LanguageDescriptor, options: RuntimeOptions = {}): Runtime {
  let layers: readonly PortLayer[] = options.layers ?? [];
  let globalDescriptor = composeGlobal(layers);

  const entries = new Map<string, ProgramEntry>();
  // Live values of the GLOBAL inputs. Declared names only, so a layer's removal takes its
  // values with it and a stale value can never re-seed a later program.
  const globalValues = new Map<string, unknown>();
  // Global input name → ids of the programs whose outputs depend on it.
  const inputIndex = new Map<string, Set<string>>();
  const globalOutputHandlers = new Set<OutputHandler>();
  const globalErrorHandlers = new Set<ErrorHandler>();
  const layerListeners = new Set<(layers: readonly PortLayer[]) => void>();

  // The global layers alone. A host builds these, so a problem is a setup bug: fail fast.
  function composeGlobal(ls: readonly PortLayer[]): LanguageDescriptor {
    const composed = composeLayers(base, ls, []);
    if (!composed.ok)
      throw new Error(report("Global port layers do not compose", composed.problems));
    return composed.descriptor;
  }

  // One entry's descriptor: the global layers plus what this program declares itself.
  function bind(id: string, program: CoreProgram, ports: Ports): BoundProgram {
    const composed = composeLayers(base, layers, [{ id, ports, policy: Policy.user }]);
    if (!composed.ok) {
      throw new Error(report(`Ports of program '${id}' do not compose`, composed.problems));
    }
    return { program, ports, composed: composed.descriptor };
  }

  const globalInputs = (): ReadonlyMap<string, InputDefinition> => globalDescriptor.inputs;

  function addToIndex(entry: ProgramEntry): void {
    for (const name of entry.indexedNames()) {
      let ids = inputIndex.get(name);
      if (!ids) inputIndex.set(name, (ids = new Set()));
      ids.add(entry.id);
    }
  }

  function removeFromIndex(entry: ProgramEntry): void {
    for (const name of entry.indexedNames()) inputIndex.get(name)?.delete(entry.id);
  }

  function notifyOutput(entry: ProgramEntry, outputs: Map<string, unknown>): void {
    for (const handler of globalOutputHandlers) handler(entry.id, outputs);
    for (const handler of entry.outputHandlers) handler(outputs);
  }

  function notifyError(entry: ProgramEntry, error: EvalError): void {
    for (const handler of globalErrorHandlers) handler(entry.id, error);
    for (const handler of entry.errorHandlers) handler(error);
  }

  // Evaluate one entry and route the outcome. An evaluation error reaches onError and
  // answers null - no outputs, and never a throw.
  function evaluateAndRoute(
    entry: ProgramEntry,
    changed?: Set<string>,
  ): Map<string, unknown> | null {
    const result = entry.evaluate(changed);
    if (!result.ok) {
      notifyError(entry, result.error);
      return null;
    }
    notifyOutput(entry, result.outputs);
    return result.outputs;
  }

  function applyChanges(changes: Map<string, unknown>): Map<string, Map<string, unknown>> {
    const accepted = new Map<string, unknown>();
    for (const [name, value] of changes) {
      if (globalInputs().has(name)) accepted.set(name, value);
    }
    const results = new Map<string, Map<string, unknown>>();
    if (accepted.size === 0) return results;

    const changed = new Set(accepted.keys());
    const affected = new Set<string>();
    for (const name of changed) {
      for (const id of inputIndex.get(name) ?? []) affected.add(id);
    }

    for (const [name, value] of accepted) {
      globalValues.set(name, value);
      for (const id of affected) entries.get(id)!.setGlobalInput(name, value);
    }

    for (const id of affected) {
      // A handler notified earlier in this pass may have unregistered a later program.
      const entry = entries.get(id);
      if (!entry) continue;
      const outputs = evaluateAndRoute(entry, changed);
      if (outputs) results.set(id, outputs);
    }
    return results;
  }

  function doUnregister(id: string): void {
    const entry = entries.get(id);
    if (!entry) return;
    removeFromIndex(entry);
    entry.outputHandlers.clear();
    entry.errorHandlers.clear();
    entries.delete(id);
  }

  function handleFor(entry: ProgramEntry, initialOutputs: Map<string, unknown>): ProgramHandle {
    return {
      id: entry.id,
      initialOutputs,
      onOutput(handler) {
        entry.outputHandlers.add(handler);
        return () => entry.outputHandlers.delete(handler);
      },
      onError(handler) {
        entry.errorHandlers.add(handler);
        return () => entry.errorHandlers.delete(handler);
      },
      setInput(name, value) {
        entry.setInput(name, value);
        return evaluateAndRoute(entry, new Set([name])) ?? new Map();
      },
      fireTrigger(name, value) {
        entry.setInput(name, value);
        const fired = evaluateAndRoute(entry, new Set([name])) ?? new Map();
        entry.resetInput(name);
        evaluateAndRoute(entry, new Set([name]));
        return fired;
      },
      unregister() {
        doUnregister(entry.id);
      },
    };
  }

  return {
    get layers() {
      return layers;
    },

    setLayer(id, ports) {
      if (!layers.some((layer) => layer.id === id)) throw new Error(`No global layer '${id}'`);
      const next = layers.map((layer) => (layer.id === id ? { ...layer, ports } : layer));
      const composed = composeLayers(base, next, []);
      if (!composed.ok) return composed.problems;

      layers = next;
      globalDescriptor = composed.descriptor;
      for (const name of [...globalValues.keys()]) {
        if (!globalInputs().has(name)) globalValues.delete(name);
      }
      // Notified last: a listener recompiles against the state this call just settled.
      for (const listener of layerListeners) listener(layers);
      return [];
    },

    onLayerChange(listener) {
      layerListeners.add(listener);
      return () => layerListeners.delete(listener);
    },

    register(id, program, options = {}) {
      if (entries.has(id)) throw new Error(`Program '${id}' is already registered - use replace`);
      const ports = options.ports ?? EMPTY_PORTS;
      const entry = new ProgramEntry(id, bind(id, program, ports), globalValues);
      entries.set(id, entry);
      addToIndex(entry);

      const declared = new Set(ports.inputs.map((input) => input.name));
      for (const [name, value] of Object.entries(options.values ?? {})) {
        if (declared.has(name)) entry.setInput(name, value);
      }
      return handleFor(entry, evaluateAndRoute(entry) ?? new Map());
    },

    replace(id, program, options = {}) {
      const entry = entries.get(id);
      if (!entry) throw new Error(`Program '${id}' is not registered`);
      const bound = bind(id, program, options.ports ?? entry.ports);
      removeFromIndex(entry);
      entry.replace(bound, globalValues);
      addToIndex(entry);
      return handleFor(entry, evaluateAndRoute(entry) ?? new Map());
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
      const def = globalInputs().get(name);
      if (def) applyChanges(new Map([[name, defaultValueFor(def, globalDescriptor)]]));
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
      const entry = entries.get(programId);
      return entry ? outputDependencies(entry.program) : undefined;
    },
  };
}

const report = (headline: string, problems: readonly PortProblem[]): string =>
  `${headline}:\n` + problems.map((p) => `  - ${p.where}: ${p.message}`).join("\n");
