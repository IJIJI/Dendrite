import { CNode, SourceRef } from "../infra/nodes";
import { CoreProgram } from "../infra/program";
import { LanguageDescriptor } from "../infra/registry";
import { type Type } from "../infra/types";

//? Analysis Results
export type AnalysisErrorKind =
  | "unknown_op" // Op not in descriptor
  | "unknown_program_input" // Context input not in descriptor
  | "unknown_type" // Type string not in descriptor
  | "binding_cycle" // Cycle in binding DAG
  | "missing_required_program_output" // Required program output not declared
  | "undeclared_binding_reference" // Ref to a binding that was never declared
  | "forward_reference" // Binding used before its declaration line (code editor only)
  | "op_input_type_mismatch" // Op node input port receives an incompatible type
  | "program_output_type_mismatch" // Program output mapped to an incompatible type
  | "output_depends_on_failed_binding" // Known output dropped: depends on a poisoned binding
  | "body_binding_count_mismatch" // HigherOrderNode.bindings length ≠ op's bodyBindings length
  | "wrong_node_kind_for_op" // Standard node used for a higher-order op, or vice versa
  | "lambda_return_type_mismatch"; // Lambda body type incompatible with its return annotation

export interface AnalysisError {
  kind: AnalysisErrorKind;
  name: string;
  message: string;
  source?: SourceRef;
}

export type AnalysisWarningKind =
  | "unknown_program_output" // Program declares an output name not in the descriptor → dropped
  | "unused_binding" // Binding declared but never referenced by any output
  | "missing_desired_program_output" // Descriptor marks output as 'desired' but program omits it
  | "field_access_on_primitive" // Field access on string/number/boolean typed node
  | "unknown_op_input_key" // Op node passes a key not declared by the op
  | "missing_op_input" // Required OpInput absent — type-default placeholder injected
  | "implicit_any_cast"; // Any-typed value flows into a narrow expected type

export interface AnalysisWarning {
  kind: AnalysisWarningKind;
  name: string;
  message: string;
  source?: SourceRef;
}

export interface AnalysisResult {
  ok: boolean; // false ONLY when a required output was dropped or missing
  program: CoreProgram; // always present; outputs = only surviving outputs
  errors: AnalysisError[];
  warnings: AnalysisWarning[];
}

export interface AnalysisContext {
  descriptor: LanguageDescriptor;
  analysedBindings: Map<string, CNode>;
  failedBindings: Set<string>;
  boundNames: ReadonlyMap<string, Type>; // scoped var name → type; empty at top level
  declarationIndex: ReadonlyMap<string, number>; // insertion order → ordering source of truth for lexical check
  bindingSourceRefs: ReadonlyMap<string, SourceRef>; // for error-message detail only (not ordering)
  currentBindingIndex: number | undefined; // index of binding being analysed; undefined when analysing outputs
  enforceCodeOrder: boolean; // true for code editor, false for rete/mixed
  errors: AnalysisError[];
  warnings: AnalysisWarning[];
}
