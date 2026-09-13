import { type AnalysisErrorKind, type AnalysisWarningKind } from "./analyser/types";
import { type PortProblem } from "./compose";
import { type LoadError } from "./environment";
import { type EvalErrorKind } from "./evaluator/types";
import { den, type SavedProgram } from "./infra/serialise";
import { Type } from "./infra/types";
import { type ParseErrorKind, type ParseWarningKind } from "./parser/types";

//? Every diagnostic the language can produce, in one place, with a program that triggers it.
//
// The kinds themselves live as string-literal unions next to the stage that raises them
// (parser, analyser, compose, evaluator, environment). This module is what turns those into
// something a reader can use: what each one MEANS, and a sample that provokes exactly it.
// `diagnostics.test.ts` runs every sample, so an entry cannot describe something the
// language no longer does, and the `satisfies` below fails to compile the moment a kind is
// added without being documented here.
//
// One entry per kind, not per (stage, kind): `unknown_type` and `incompatible_field_override`
// are declared in the analyser's union AND in PortProblem's, and mean the same thing in both.
// `stage` says where a host actually meets it, which is not always where it is declared - see
// the four descriptor checks below.

export interface DiagnosticDoc {
  /** Where a host meets it. */
  stage: "load" | "parse" | "ports" | "analyse" | "evaluate";
  severity: "error" | "warning";
  /** What it means, in the terms of whoever has to fix it. One sentence. */
  message: string;
  /** A program that provokes it. Carries its own `ports` when the declaration is the point. */
  example?: SavedProgram;
  /** Input values, for an `evaluate` kind that only fires once the program runs. */
  inputs?: Record<string, unknown>;
  /** For a kind no program can provoke: what does. */
  triggeredBy?: string;
}

const withPorts = (program: SavedProgram, ports: SavedProgram["ports"]): SavedProgram => ({
  ...program,
  ports,
});

/** Every kind, keyed by the string that appears on the diagnostic. */
export const diagnostics = {
  // ── load: the stored blob itself, before anything is read ────────────────────
  unsupported_form: {
    stage: "load",
    severity: "error",
    message: "The saved program is in a form this build cannot read.",
    triggeredBy: "Loading a `rete`-form program: the graph adapter does not exist yet.",
  },
  unsupported_version: {
    stage: "load",
    severity: "error",
    message: "The saved program was written by a newer version of the format.",
    triggeredBy: "Loading a blob whose `version` is higher than this build's.",
  },
  malformed_program: {
    stage: "load",
    severity: "error",
    message: "The stored blob is not a program: its shape, or its ports, did not survive.",
    triggeredBy:
      "Loading hand-edited or truncated JSON - an `ast` form with a node kind that does not exist, or a `ports` key that is not ports.",
  },

  // ── parse: the text ──────────────────────────────────────────────────────────
  syntax_error: {
    stage: "parse",
    severity: "error",
    message: "The text is not a program at this point.",
    example: den`
      output x = If(true, then: 1, 2)
    `,
  },
  unexpected_token: {
    stage: "parse",
    severity: "error",
    message: "Something turned up where no expression could begin.",
    example: den`
      output x = )
    `,
  },
  unexpected_end: {
    stage: "parse",
    severity: "error",
    message: "The program ran out mid-expression: a bracket or an argument list was left open.",
    example: den`
      output x = [1, 2
    `,
  },
  duplicate_binding: {
    stage: "parse",
    severity: "error",
    message: "Two bindings share a name. The first one is kept.",
    example: den`
      let x = 1
      let x = 2
      output y = x
    `,
  },
  unterminated_string: {
    stage: "parse",
    severity: "error",
    message: "A string literal has no closing quote.",
    example: den`
      output x = "abc
    `,
  },
  unknown_character: {
    stage: "parse",
    severity: "error",
    message: "A character that is neither part of the language nor claimed by any operator.",
    example: den`
      output x = @
    `,
  },
  deprecated_syntax: {
    stage: "parse",
    severity: "warning",
    message: "A form that still parses but has been replaced.",
    triggeredBy:
      "Nothing today. The kind is reserved: no form has been deprecated yet, so nothing in the language emits it.",
  },
  unterminated_comment: {
    stage: "parse",
    severity: "warning",
    message: "A block comment runs to the end of the file. It is still read as a comment.",
    example: den`
      output x = 1 /* runs off
    `,
  },
  invalid_escape: {
    stage: "parse",
    severity: "warning",
    message: "A backslash escape the lexer does not know. Both characters are kept as written.",
    example: den`
      output x = "a\qb"
    `,
  },

  // ── ports: composing the declarations a program is checked against ───────────
  invalid_name: {
    stage: "ports",
    severity: "error",
    message: "A declared name is not a legal identifier.",
    example: withPorts(den`output x = 1`, {
      inputs: [{ name: "2bad", type: Type.number }],
      outputs: [],
    }),
  },
  duplicate_name: {
    stage: "ports",
    severity: "error",
    message: "One layer declares the same name twice.",
    example: withPorts(den`output x = 1`, {
      inputs: [
        { name: "a", type: Type.number },
        { name: "a", type: Type.number },
      ],
      outputs: [],
    }),
  },
  shadowed_name: {
    stage: "ports",
    severity: "error",
    message:
      "A layer claims a name an earlier layer, or the language, already has. Order is authority: the later one is the problem.",
    example: withPorts(den`output x = 1`, {
      types: [{ name: "number" }],
      inputs: [],
      outputs: [],
    }),
  },
  unknown_type: {
    stage: "ports",
    severity: "error",
    message: "A declaration names a type nothing registered.",
    example: withPorts(den`output x = 1`, {
      inputs: [{ name: "a", type: Type.name("Nope") }],
      outputs: [],
    }),
  },
  incompatible_field_override: {
    stage: "ports",
    severity: "error",
    message: "A struct field's type clashes with the one it inherits from the type it extends.",
    example: withPorts(den`output x = 1`, {
      types: [
        { name: "Parent", fields: { id: Type.number } },
        { name: "Child", extends: "Parent", fields: { id: Type.string } },
      ],
      inputs: [],
      outputs: [],
    }),
  },
  missing_evaluator: {
    stage: "ports",
    severity: "error",
    message: "An op was registered with no evaluator, so nothing could ever run it.",
    triggeredBy:
      "A language that calls `registerOp` without a matching `registerEvaluator`. It is a mistake in the language, not in a program, so composing THROWS rather than reporting: the editor shows it as a failed mount.",
  },
  orphan_evaluator: {
    stage: "ports",
    severity: "error",
    message: "An evaluator was registered for an op that does not exist - usually a typo.",
    triggeredBy:
      "A `registerEvaluator` whose `op` name matches nothing. Like a missing evaluator, this throws when the language composes.",
  },

  // ── analyse: the program against those declarations ──────────────────────────
  unknown_op: {
    stage: "analyse",
    severity: "error",
    message: "A call names an op the language does not have.",
    triggeredBy:
      "Not code you can write: `Nope(1)` in source is a call on an unknown NAME, which is an undeclared_binding_reference. This one needs an op node that was built without the parser - a stored `ast` program, or a host operator that desugars to an op nobody registered.",
  },
  unknown_program_input: {
    stage: "analyse",
    severity: "error",
    message: "The program reads a `$name` that nothing declared.",
    example: den`
      output x = $nope
    `,
  },
  binding_cycle: {
    stage: "analyse",
    severity: "error",
    message:
      "Bindings depend on each other in a loop, so none of them has a value. This is also why a name cannot refer to itself, and why every program finishes.",
    example: den`
      let a = b
      let b = a
      output x = a
    `,
  },
  undeclared_binding_reference: {
    stage: "analyse",
    severity: "error",
    message: "A name that is not a binding, an input, or a lambda parameter.",
    example: den`
      output x = nope
    `,
  },
  forward_reference: {
    stage: "analyse",
    severity: "error",
    message:
      "In code, a name is used above the line that declares it. A rule about the text, not the language: the same program built as a graph carries no such rule.",
    example: den`
      let early = late
      let late  = 1
      output x  = early
    `,
  },
  unknown_field: {
    stage: "analyse",
    severity: "error",
    message: "Field access on a struct type that has no such field.",
    example: withPorts(den`output x = $bus.nope`, {
      types: [{ name: "Bus", fields: { id: Type.number } }],
      inputs: [{ name: "bus", type: Type.name("Bus") }],
      outputs: [{ name: "x", type: Type.any }],
    }),
  },
  op_input_type_mismatch: {
    stage: "analyse",
    severity: "error",
    message: "An op input was handed a value of a type it does not accept.",
    example: den`
      output x = And(true, "Country")
    `,
  },
  program_output_type_mismatch: {
    stage: "analyse",
    severity: "error",
    message: "An output produces a value that does not fit the type it was declared with.",
    example: withPorts(den`output out = "text"`, {
      inputs: [],
      outputs: [{ name: "out", type: Type.number }],
    }),
  },
  output_depends_on_failed_binding: {
    stage: "analyse",
    severity: "error",
    message:
      "The output was dropped because something it reads failed. Only this output is lost; the others still run.",
    example: withPorts(
      den`
        let bad  = And(true, "Country")
        output x = bad
      `,
      { inputs: [], outputs: [{ name: "x", type: Type.any }] },
    ),
  },
  lambda_return_type_mismatch: {
    stage: "analyse",
    severity: "error",
    message: "A lambda's body does not produce what its return annotation promised.",
    triggeredBy:
      "A return annotation, which the code syntax has no way to write - only a stored `ast` program carries one. Hand a lambda to an op that wanted a different shape and you get an op_input_type_mismatch on the op's input instead.",
  },
  app_callee_not_function: {
    stage: "analyse",
    severity: "error",
    message: "Something that is not a function was called.",
    example: den`
      let n = 1
      output x = n(1)
    `,
  },
  app_argument_mismatch: {
    stage: "analyse",
    severity: "error",
    message: "The arguments do not line up with the function's parameters.",
    example: den`
      let f = x => x
      output y = f(1, 2)
    `,
  },
  app_argument_type_mismatch: {
    stage: "analyse",
    severity: "error",
    message: "An argument's type does not fit the parameter it resolved to.",
    example: den`
      let f = (x: number) => x
      output y = f("text")
    `,
  },
  missing_required_program_output: {
    stage: "analyse",
    severity: "error",
    message:
      "An output the host marked required is missing, or was dropped. This is the one case that fails the whole program.",
    example: withPorts(den`output other = 1`, {
      inputs: [],
      outputs: [
        { name: "needed", type: Type.number, mode: "required" },
        { name: "other", type: Type.number },
      ],
    }),
  },
  unknown_program_output: {
    stage: "analyse",
    severity: "warning",
    message: "The program declares an output nobody asked for. It is dropped.",
    example: den`
      output nobodyWants = 1
    `,
  },
  unused_binding: {
    stage: "analyse",
    severity: "warning",
    message: "A binding no output can reach. It is dropped from the program that runs.",
    example: den`
      let spare = 1
      output x = 2
    `,
  },
  missing_desired_program_output: {
    stage: "analyse",
    severity: "warning",
    message: "An output the host would have liked is not declared.",
    example: withPorts(den`output other = 1`, {
      inputs: [],
      outputs: [
        { name: "wanted", type: Type.number, mode: "desired" },
        { name: "other", type: Type.number },
      ],
    }),
  },
  field_access_on_primitive: {
    stage: "analyse",
    severity: "warning",
    message: "Field access on a number, string or boolean, which has no fields.",
    example: withPorts(den`output x = $n.field`, {
      inputs: [{ name: "n", type: Type.number }],
      outputs: [{ name: "x", type: Type.any }],
    }),
  },
  unknown_op_input_key: {
    stage: "analyse",
    severity: "warning",
    message: "An argument named for an input the op does not have. It is ignored.",
    example: den`
      output x = If(condition: true, then: 1, else: 2, nope: 3)
    `,
  },
  missing_op_input: {
    stage: "analyse",
    severity: "warning",
    message:
      "An op input was left out; the type's default stands in. This is why a half-written program keeps running.",
    example: den`
      output x = If(true, 1)
    `,
  },
  implicit_any_cast: {
    stage: "analyse",
    severity: "warning",
    message:
      "An `any` value flowed somewhere narrower. Allowed, and the reason it might fail at runtime instead.",
    example: withPorts(den`output x = Add($loose, 1)`, {
      inputs: [{ name: "loose", type: Type.any }],
      outputs: [{ name: "x", type: Type.number }],
    }),
  },

  // ── evaluate: while the program runs ─────────────────────────────────────────
  // These do not arrive as diagnostics. An evaluation failure reaches a host on the outputs
  // (`outputs.error`), because by then the program compiled and something in the world, or a
  // host's own evaluator, was not what it claimed.
  input_not_set: {
    stage: "evaluate",
    severity: "error",
    message: "An input had no value when something needed it.",
    triggeredBy:
      "Evaluating outside the runtime, with `run()` over a state whose `inputs` map lacks a name the program reads. Through a runtime or an instance every declared input is seeded first, so this one stays a safety net.",
  },
  invalid_field_access: {
    stage: "evaluate",
    severity: "error",
    message: "A field was read from a value that does not have it.",
    triggeredBy:
      "A host pushing a value that does not match the struct type its input was declared with - nothing validates a pushed value against its type yet.",
  },
  host_error: {
    stage: "evaluate",
    severity: "error",
    message: "An op's own evaluator threw.",
    triggeredBy:
      "Any `registerEvaluator` function that raises - a host op reaching for something that is not there. The op's name and the original message come with it.",
  },
  evaluator_not_found: {
    stage: "evaluate",
    severity: "error",
    message: "A compiled node names an op with no evaluator.",
    triggeredBy:
      "Nothing a program can do: composing rejects a language whose ops lack evaluators, so this is a safety net for a descriptor swapped underneath a compiled program.",
  },
  undefined_reference: {
    stage: "evaluate",
    severity: "error",
    message: "A reference survived analysis but names nothing at evaluation time.",
    triggeredBy: "An analyser bug, or a hand-built core program that was never analysed.",
  },
  error_node_reached: {
    stage: "evaluate",
    severity: "error",
    message: "A node that failed analysis was reached anyway.",
    triggeredBy: "An analyser bug: pruning should have dropped it with the output that read it.",
  },
  not_a_function: {
    stage: "evaluate",
    severity: "error",
    message: "Something applied as a function did not evaluate to one.",
    triggeredBy:
      "An analyser bug: the checker rejects a call on anything that is not function-typed, so reaching this means a program ran unchecked.",
  },
} satisfies Record<
  | LoadError["kind"]
  | ParseErrorKind
  | ParseWarningKind
  | PortProblem["kind"]
  | AnalysisErrorKind
  | AnalysisWarningKind
  | EvalErrorKind,
  DiagnosticDoc
>;

/** Every kind, as a list, in reading order: load, parse, ports, analyse, evaluate. */
export const diagnosticList: readonly (DiagnosticDoc & { kind: string })[] = Object.entries(
  diagnostics,
).map(([kind, doc]) => ({ kind, ...doc }));
