import { createEvalState, evaluateProgram, updateInput } from "../evaluator/evaluator";
import { EvalError, type EvalState } from "../evaluator/types";
import { type Ports } from "../infra/ports";
import { type CoreProgram } from "../infra/program";
import { type InputDefinition, type LanguageDescriptor } from "../infra/registry";
import { defaultValueFor } from "./seed";

//? ProgramEntry: one registered program's runtime state - its evaluation state, the values
// of its program-level inputs, and its subscribers. Internal to the runtime. Global values
// belong to the runtime and are handed in whenever the entry (re)seeds; program-level values
// belong to the entry and survive a replace for every name still declared.

/** A compiled program with the ports it declares itself and the descriptor it was analysed against. */
export interface BoundProgram {
  program: CoreProgram;
  /** Program-level ports, all program-level layers flattened. */
  ports: Ports;
  /** composeLayers(language, globalLayers, programLayers).descriptor - resolves layer types for seeding. */
  composed: LanguageDescriptor;
}

export type EvalOutcome =
  | { ok: true; outputs: Map<string, unknown> }
  | { ok: false; error: EvalError };

// Everything a replace swaps out at once.
interface Live {
  bound: BoundProgram;
  inputs: ReadonlyMap<string, InputDefinition>; // the program-level inputs
  state: EvalState;
}

export class ProgramEntry {
  readonly outputHandlers = new Set<(outputs: Map<string, unknown>) => void>();
  readonly errorHandlers = new Set<(error: EvalError) => void>();
  private readonly values = new Map<string, unknown>();
  private live: Live;

  constructor(
    readonly id: string,
    bound: BoundProgram,
    globalValues: ReadonlyMap<string, unknown>,
  ) {
    this.live = this.activate(bound, globalValues);
  }

  get program(): CoreProgram {
    return this.live.bound.program;
  }

  /** The program-level ports this entry was bound with. */
  get ports(): Ports {
    return this.live.bound.ports;
  }

  /** Current values of the program-level inputs. */
  get programValues(): ReadonlyMap<string, unknown> {
    return this.values;
  }

  /** Swap in a new compiled program: fresh evaluation state, values kept for surviving names. */
  replace(bound: BoundProgram, globalValues: ReadonlyMap<string, unknown>): void {
    this.live = this.activate(bound, globalValues);
  }

  setInput(name: string, value: unknown): void {
    this.programInput(name);
    this.values.set(name, value);
    updateInput(name, value, this.live.state);
  }

  /**
   * Push a runtime-owned value into the evaluation state. Global values belong to the
   * runtime, so they are not recorded in programValues and do not survive a replace on
   * their own - the runtime hands them back when the entry re-seeds.
   */
  setGlobalInput(name: string, value: unknown): void {
    if (this.live.inputs.has(name)) {
      throw new Error(`'${name}' is a program-level input of program '${this.id}'`);
    }
    updateInput(name, value, this.live.state);
  }

  /** Back to the input's default - the second half of firing a program-level trigger. */
  resetInput(name: string): void {
    this.setInput(name, defaultValueFor(this.programInput(name), this.live.bound.composed));
  }

  /** The global input names this program's outputs depend on - what the runtime indexes. */
  indexedNames(): Set<string> {
    const names = new Set<string>();
    for (const output of this.program.outputs.values()) {
      for (const name of output.dependsOn) if (!this.live.inputs.has(name)) names.add(name);
    }
    return names;
  }

  /** Evaluate every output. An EvalError is an outcome; anything else is a bug and propagates. */
  evaluate(changed?: Set<string>): EvalOutcome {
    const { bound, state } = this.live;
    try {
      return { ok: true, outputs: evaluateProgram(bound.program, state, bound.composed, changed) };
    } catch (e) {
      if (e instanceof EvalError) return { ok: false, error: e };
      throw e;
    }
  }

  // Fresh state seeded with defaults for every input, then the runtime's global values, then
  // this entry's own program-level values (dropping any whose input is no longer declared).
  private activate(bound: BoundProgram, globalValues: ReadonlyMap<string, unknown>): Live {
    const inputs = new Map(bound.ports.inputs.map((input) => [input.name, input]));
    const state = createEvalState();
    for (const [name, def] of bound.composed.inputs) {
      updateInput(name, defaultValueFor(def, bound.composed), state);
    }
    for (const [name, value] of globalValues) updateInput(name, value, state);
    for (const [name, value] of [...this.values]) {
      if (inputs.has(name)) updateInput(name, value, state);
      else this.values.delete(name);
    }
    return { bound, inputs, state };
  }

  private programInput(name: string): InputDefinition {
    const def = this.live.inputs.get(name);
    if (!def) throw new Error(`'${name}' is not a program-level input of program '${this.id}'`);
    return def;
  }
}
