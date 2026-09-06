import { type ComposeResult, type PortProblem } from "../compose";
import { type ProgramEnvironmentFactory, type LoadResult } from "../environment";
import { type EvalError } from "../evaluator/types";
import { type SourceRef } from "../infra/nodes";
import { type Observable, createSubject } from "../infra/observable";
import { EMPTY_PORTS, flattenPorts, type PortLayer, type Ports, Policy } from "../infra/ports";
import { type LanguageDescriptor } from "../infra/registry";
import { type SavedProgram } from "../infra/serialise";
import { type ProgramHandle, type Runtime } from "./runtime";
import { defaultValueFor } from "./seed";

//? ProgramInstance: one deployed program, with the port layers it declares on top of the
// runtime's global ones, the values of those ports, and everything a UI or a host needs to
// watch. A Facade over an environment and a runtime: it composes, compiles, registers,
// re-registers when the global layers move under it, and publishes the outcome.
//
// It publishes through five observables and nothing else. `snapshot` is the odd one out:
// it is the memento a host saves, so it emits ONLY when something a save would capture
// changes - the persisted layer's ports, the values of that layer's inputs, or the program
// itself. A host pushing a value into one of its own inputs leaves it silent, so a sensor
// writing every frame never marks a document dirty.
//
// Core stays timer-free: every publish here is synchronous. Debouncing is the subscriber's.

/** A problem from any stage of getting a program running, on one shape. */
export interface ProgramDiagnostic {
  severity: "error" | "warning";
  /** Which stage produced it. `ports` problems carry `layerId` / `where` instead of a source. */
  stage: "ports" | "load" | "parse" | "analyse";
  kind: string;
  message: string;
  source?: SourceRef;
  layerId?: string;
  /** The offending declaration, e.g. "input score" - so a pane can point at the row. */
  where?: string;
}

/**
 * The last evaluation. `outputs` is null only while nothing has ever compiled. `stale` means
 * these outputs no longer reflect the current program or inputs: the last compile failed, or
 * the last evaluation errored, and what is shown is what the lights are still following.
 */
export interface EvalResult {
  outputs: ReadonlyMap<string, unknown> | null;
  error: EvalError | null;
  stale: boolean;
}

export interface AttachedLayer {
  layer: PortLayer;
  level: "global" | "program";
}

/** Every layer in play and what composing them produced. */
export interface PortsState {
  layers: readonly AttachedLayer[];
  composed: ComposeResult;
}

/** What a host stores: the program plus the values of its persisted layer's inputs. */
export interface Snapshot {
  program: SavedProgram;
  inputValues: Record<string, unknown>;
}

export interface InstanceOptions {
  program: SavedProgram;
  /**
   * The program-level layers, in precedence order. Omitted means one editable, persisted
   * `document` layer carrying `program.ports`. Given (even empty) is taken verbatim, and
   * `program.ports` is then the host's business rather than ours.
   */
  layers?: readonly PortLayer[];
  id?: string;
  /** Starting values, accepted for the persisted layer's inputs only. */
  inputValues?: Readonly<Record<string, unknown>>;
}

export interface ProgramInstance {
  readonly id: string;
  readonly diagnostics: Observable<readonly ProgramDiagnostic[]>;
  readonly ports: Observable<PortsState>;
  readonly outputs: Observable<EvalResult>;
  /** Every program-level value, whoever feeds it. */
  readonly values: Observable<Readonly<Record<string, unknown>>>;
  readonly snapshot: Observable<Snapshot>;

  /**
   * Replace one program-level layer's ports. Returns the problems that make the change
   * impossible, in which case nothing moves; an empty list means it was applied. Problems
   * the change causes for OTHER layers do not block it - they surface as `ports`
   * diagnostics and the outputs go stale, because order is authority and an earlier layer
   * outranks a later one. Unknown id throws.
   */
  setLayer(id: string, ports: Ports): PortProblem[];
  /** Set one program-level input. Throws on a global name. */
  setInput(name: string, value: unknown): void;
  /** Fire a program-level trigger: set, evaluate, reset to its default, evaluate again. */
  fireTrigger(name: string, value: unknown): void;
  /**
   * Swap the program. `saved.ports` always targets the persisted layer: present replaces
   * that layer's ports, absent leaves them. Present with no persisted layer throws.
   */
  setProgram(saved: SavedProgram): void;
  /** Unregister from the runtime and stop listening. */
  dispose(): void;
}

let instances = 0;

export function createInstance(
  factory: ProgramEnvironmentFactory,
  runtime: Runtime,
  options: InstanceOptions,
): ProgramInstance {
  return new Instance(factory, runtime, options);
}

class Instance implements ProgramInstance {
  readonly id: string;

  private readonly diagnostics$ = createSubject<readonly ProgramDiagnostic[]>([]);
  private readonly ports$: ReturnType<typeof createSubject<PortsState>>;
  private readonly outputs$ = createSubject<EvalResult>({
    outputs: null,
    error: null,
    stale: false,
  });
  private readonly values$ = createSubject<Readonly<Record<string, unknown>>>({});
  private readonly snapshot$: ReturnType<typeof createSubject<Snapshot>>;

  readonly diagnostics: Observable<readonly ProgramDiagnostic[]> = this.diagnostics$;
  readonly ports: Observable<PortsState>;
  readonly outputs: Observable<EvalResult> = this.outputs$;
  readonly values: Observable<Readonly<Record<string, unknown>>> = this.values$;
  readonly snapshot: Observable<Snapshot>;

  private saved: SavedProgram;
  private layers: readonly PortLayer[];
  private handle: ProgramHandle | null = null;
  // Does the registered program still reflect the current source and layers? False after a
  // failed compose or compile, which is what stops new values being pushed into a program
  // the user has already moved on from. An evaluation error leaves it true - changing an
  // input is how you recover from one.
  private live = false;
  // The live program-level values. The public `values` observable is the view of it.
  private programValues: Record<string, unknown> = {};
  private stale = false;
  private readonly unsubscribes: (() => void)[] = [];

  constructor(
    private readonly factory: ProgramEnvironmentFactory,
    private readonly runtime: Runtime,
    options: InstanceOptions,
  ) {
    this.id = options.id ?? `instance-${++instances}`;
    this.saved = options.program;
    this.layers = options.layers ?? [
      { id: "document", ports: options.program.ports ?? EMPTY_PORTS, policy: Policy.user },
    ];
    if (this.layers.filter((layer) => layer.policy.persisted).length > 1) {
      throw new Error(
        `Instance '${this.id}' has more than one persisted layer; merge them into one`,
      );
    }

    // Starting values are the host's, but only for what it may persist - a value for a
    // host-fed input would be saved and re-seeded stale on the next load.
    const persisted = this.persistedLayer();
    for (const input of persisted?.ports.inputs ?? []) {
      if (options.inputValues && input.name in options.inputValues) {
        this.programValues[input.name] = options.inputValues[input.name];
      }
    }

    this.ports$ = createSubject<PortsState>({
      layers: this.attached(),
      composed: { ok: false, problems: [] },
    });
    this.ports = this.ports$;

    this.unsubscribes.push(this.runtime.onLayerChange(() => this.recompile()));
    this.recompile();
    // After the first compile, so the snapshot reports the values it just seeded.
    this.snapshot$ = createSubject<Snapshot>(this.buildSnapshot());
    this.snapshot = this.snapshot$;
  }

  setLayer(id: string, ports: Ports): PortProblem[] {
    if (!this.layers.some((layer) => layer.id === id)) {
      throw new Error(`No program-level layer '${id}' on instance '${this.id}'`);
    }
    const next = this.layers.map((layer) => (layer.id === id ? { ...layer, ports } : layer));

    const composed = this.factory.forProgram(this.runtime.layers, next);
    const blocking = composed.ok ? [] : composed.problems.filter((p) => p.layerId === id);
    if (blocking.length > 0) return blocking;

    const wasPersisted = this.persistedLayer()?.id === id;
    this.layers = next;
    this.recompile();
    if (wasPersisted) this.publishSnapshot();
    return [];
  }

  setInput(name: string, value: unknown): void {
    this.assertProgramInput(name);
    if (Object.is(this.programValues[name], value) && name in this.programValues) return;
    this.storeValue(name, value);
    // While the registered program is behind the source, the value is kept for the compile
    // that recovers rather than fed to a program the user has already replaced.
    if (this.live) this.handle?.setInput(name, value);
  }

  fireTrigger(name: string, value: unknown): void {
    this.assertProgramInput(name);
    if (!this.live) return;
    this.handle?.fireTrigger(name, value);
    // The runtime has already reset it; mirror where the value landed, quietly when it did
    // not move (a trigger that starts and ends at its default must not dirty the document).
    const def = this.declaredInputs().get(name);
    const descriptor = this.descriptor();
    if (def && descriptor) this.storeValue(name, defaultValueFor(def, descriptor));
  }

  setProgram(saved: SavedProgram): void {
    const persisted = this.persistedLayer();
    if (saved.ports && !persisted) {
      throw new Error(
        `Instance '${this.id}' has no persisted layer, so a program's own ports have nowhere to go`,
      );
    }
    if (saved.ports && persisted) {
      this.layers = this.layers.map((layer) =>
        layer === persisted ? { ...layer, ports: saved.ports as Ports } : layer,
      );
    }
    this.saved = saved;
    this.recompile();
    this.publishSnapshot();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
    this.handle?.unregister();
    this.handle = null;
  }

  // ── the loop ───────────────────────────────────────────────────────────────

  // Compose, compile, then (re)register. Every failure path publishes its diagnostics and
  // leaves the last good outputs in place, marked stale, because those are what a host is
  // still acting on.
  private recompile(): void {
    const composed = this.factory.forProgram(this.runtime.layers, this.layers);
    this.ports$.set({
      layers: this.attached(),
      composed: composed.ok
        ? {
            ok: true,
            descriptor: composed.environment.descriptor,
            provenance: composed.environment.provenance,
          }
        : { ok: false, problems: composed.problems },
    });
    if (!composed.ok) {
      this.fail(composed.problems.map(portDiagnostic));
      return;
    }

    const loaded = composed.environment.load(this.saved);
    const diagnostics = diagnosticsOf(loaded);
    if (!loaded.ok) {
      this.fail(diagnostics);
      return;
    }

    this.diagnostics$.set(diagnostics);
    this.seedValues(composed.environment.descriptor);
    const ports = flattenPorts(this.layers);
    const values = this.programValues;
    // Settled before re-registering, so the evaluation a replace triggers is published once,
    // by the subscription below, already carrying the right flag.
    this.live = true;
    this.stale = false;
    if (this.handle) {
      this.handle = this.runtime.replace(this.id, loaded.program, { ports, values });
      return;
    }

    this.handle = this.runtime.register(this.id, loaded.program, { ports, values });
    this.unsubscribes.push(
      this.handle.onOutput((outputs) => {
        // Outputs of a program that still matches the source are current by definition;
        // while it does not, even the runtime's own re-evaluations stay marked stale.
        if (this.live) this.stale = false;
        this.outputs$.set({ outputs, error: null, stale: this.stale });
      }),
      this.handle.onError((error) => {
        // The evaluation that should have refreshed these outputs failed, so whatever is
        // on screen is now behind the inputs.
        this.stale = true;
        this.outputs$.set({ outputs: this.outputs$.get().outputs, error, stale: true });
      }),
    );
    // The first evaluation ran inside register(), before those handlers existed.
    this.stale = this.handle.initialError !== null;
    this.outputs$.set({
      outputs: this.handle.initialOutputs,
      error: this.handle.initialError,
      stale: this.stale,
    });
  }

  // A failed compose or compile: keep the program the runtime is still running, and say so.
  private fail(diagnostics: ProgramDiagnostic[]): void {
    this.diagnostics$.set(diagnostics);
    this.live = false;
    this.stale = true;
    const current = this.outputs$.get();
    if (current.outputs !== null || current.error !== null) {
      this.outputs$.set({ ...current, stale: true });
    }
  }

  // Keep a value whose input survived, seed the rest. This map is the truth: it is handed
  // to the runtime on every register and replace, so the entry follows rather than guesses.
  private seedValues(descriptor: LanguageDescriptor): void {
    const next: Record<string, unknown> = {};
    for (const def of flattenPorts(this.layers).inputs) {
      next[def.name] =
        def.name in this.programValues
          ? this.programValues[def.name]
          : defaultValueFor(def, descriptor);
    }
    const changed = !shallowEqual(this.programValues, next);
    this.programValues = next;
    if (changed) this.values$.set(next);
  }

  private storeValue(name: string, value: unknown): void {
    if (Object.is(this.programValues[name], value) && name in this.programValues) return;
    this.programValues = { ...this.programValues, [name]: value };
    this.values$.set(this.programValues);
    if (this.persistedLayer()?.ports.inputs.some((input) => input.name === name)) {
      this.publishSnapshot();
    }
  }

  // ── views over the layers ──────────────────────────────────────────────────

  private persistedLayer(): PortLayer | undefined {
    return this.layers.find((layer) => layer.policy.persisted);
  }

  private declaredInputs() {
    return new Map(flattenPorts(this.layers).inputs.map((input) => [input.name, input]));
  }

  private descriptor(): LanguageDescriptor | undefined {
    const composed = this.ports$.get().composed;
    return composed.ok ? composed.descriptor : undefined;
  }

  private attached(): AttachedLayer[] {
    return [
      ...this.runtime.layers.map((layer) => ({ layer, level: "global" as const })),
      ...this.layers.map((layer) => ({ layer, level: "program" as const })),
    ];
  }

  private assertProgramInput(name: string): void {
    if (!this.declaredInputs().has(name)) {
      throw new Error(`'${name}' is not a program-level input of instance '${this.id}'`);
    }
  }

  private buildSnapshot(): Snapshot {
    const persisted = this.persistedLayer();
    const program = { ...this.saved };
    if (persisted) program.ports = persisted.ports;
    else delete program.ports;

    const inputValues: Record<string, unknown> = {};
    for (const input of persisted?.ports.inputs ?? []) {
      if (input.name in this.programValues)
        inputValues[input.name] = this.programValues[input.name];
    }
    return { program, inputValues };
  }

  private publishSnapshot(): void {
    this.snapshot$.set(this.buildSnapshot());
  }
}

const portDiagnostic = (problem: PortProblem): ProgramDiagnostic => ({
  severity: "error",
  stage: "ports",
  kind: problem.kind,
  message: problem.message,
  layerId: problem.layerId,
  where: problem.where,
});

// The stage names where the pipeline stopped, which is also where its warnings were
// collected: parse warnings that survive into analysis arrive on the analyse-stage list.
function diagnosticsOf(result: LoadResult): ProgramDiagnostic[] {
  const diagnostics: ProgramDiagnostic[] = [];
  const stage: ProgramDiagnostic["stage"] = result.ok ? "analyse" : result.stage;
  const push =
    (severity: ProgramDiagnostic["severity"]) =>
    (d: { kind: string; message: string; source?: SourceRef }) =>
      diagnostics.push({ severity, stage, kind: d.kind, message: d.message, source: d.source });

  if (!result.ok) result.errors.forEach(push("error"));
  if ("warnings" in result) result.warnings.forEach(push("warning"));
  return diagnostics;
}

const shallowEqual = (a: Record<string, unknown>, b: Record<string, unknown>): boolean => {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => key in b && Object.is(a[key], b[key]))
  );
};
