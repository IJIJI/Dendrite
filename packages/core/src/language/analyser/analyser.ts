// INVARIANT: analyseNode returns a fresh CNode object on every call - every case
// spreads { ...node, ... } into a new object, and validateInputs constructs each
// missing-input placeholder fresh in its loop. CNode identity is therefore unique
// per position in a CoreProgram. The evaluator's nodeCache/bodyScope are keyed by
// object identity and rely on this; do NOT memoise or share analysed nodes.

import {
  type AppNode,
  type ASTNode,
  type CErrorNode,
  type CNode,
  type LiteralValue,
  type SourceRef,
} from "../infra/nodes";
import { RawProgram } from "../infra/program";
import { isCompatible, type LanguageDescriptor, type OpDefinition } from "../infra/registry";
import { Type, isAny, isAnyOrNull, typeToString, typesEqual } from "../infra/types";
import {
  AnalysisContext,
  AnalysisError,
  AnalysisErrorKind,
  AnalysisResult,
  AnalysisWarning,
  ErrorSubject,
} from "./types";

// Recursive DFS collecting names of RefNodes whose name is in `bindings`.
function collectRefs(node: ASTNode, bindings: Set<string>): Set<string> {
  const refs = new Set<string>();
  function walk(n: ASTNode): void {
    switch (n.kind) {
      case "literal":
      case "input":
        break;
      case "ref":
        if (bindings.has(n.name)) refs.add(n.name);
        break;
      case "array":
        for (const item of n.items) walk(item);
        break;
      case "field":
        walk(n.struct);
        break;
      case "operation": // TODO: Operations might depend on context. Should be handled.
        for (const val of Object.values(n.inputs)) {
          if (Array.isArray(val)) for (const v of val) walk(v);
          else walk(val);
        }
        break;
      case "lambda": {
        // Lambda params shadow same-named bindings within the body. Recurse with
        // the params removed from the tracked set so they don't register as
        // dependency edges (e.g. `let x = 5; let f = x => x` has no f → x edge).
        // Nested lambdas strip their own params at each level via this recursion.
        // TODO: Test if this works correctly and all dependencies are added.
        const paramNames = new Set(n.params.map((p) => p.name));
        const inner = new Set([...bindings].filter((b) => !paramNames.has(b)));
        for (const r of collectRefs(n.body, inner)) refs.add(r);
        break;
      }
      case "app":
        walk(n.callee);
        for (const arg of n.positional) walk(arg);
        for (const arg of Object.values(n.named)) walk(arg);
        break;
    }
  }
  walk(node);
  return refs;
}

function union(...sets: ReadonlySet<string>[]): ReadonlySet<string> {
  const result = new Set<string>();
  for (const s of sets) for (const v of s) result.add(v);
  return result;
}

export function getOutputType(node: CNode): Type {
  switch (node.kind) {
    case "literal":
      return node.type;
    case "array":
      // ArrayNode.type is the element, then outputted in its array form.
      return Type.array(node.type);
    case "input":
      return node.type;
    case "ref":
      return node.type;
    case "field":
      return node.type;
    case "operation":
      return node.output;
    case "lambda":
      return node.type;
    case "app":
      return node.type;
    case "error":
      return node.type ?? Type.any;
  }
}

/** Where a value flows into: how a diagnostic names it, and the value that arrived. */
interface Slot {
  /** The diagnostic's `name` field: the op input, the parameter, `(lambda return)`. */
  name: string;
  /** How to say the slot in a sentence, for when the value has no name of its own. */
  label: string;
  /** The value that arrived. */
  node: CNode;
  /** Where the squiggle goes. Not always `node.source`: a lambda's return points at the lambda. */
  source?: SourceRef;
}

// What a reader would call this value: the name they wrote, when there is one. `height >= 10`
// desugars to Not(LessThan(a, b)), so naming the op's input alone points at a name nobody typed.
function writtenAs(node: CNode): string | undefined {
  switch (node.kind) {
    case "ref":
      return node.name;
    case "input":
      return `$${node.name}`;
    case "field": {
      const struct = writtenAs(node.struct);
      return struct ? `${struct}.${node.field}` : undefined;
    }
    default:
      return undefined; // a literal, a list, a lambda, a call: the slot's label says it instead
  }
}

// Does an `any` (or a null) cross into something narrower here? Looked for INSIDE a list too:
// `any[]` fits `number[]` through array covariance, and used to cross without a word. Functions
// are left out on purpose: an `(any) -> T` lambda where `(number) -> T` is expected is the
// gradual typing isCompatible allows deliberately, and warning there would flood every Filter.
function castsAny(actual: Type, expected: Type): boolean {
  if (actual.kind === "array" && expected.kind === "array") {
    return castsAny(actual.element, expected.element);
  }
  return isAnyOrNull(actual) && !isAny(expected);
}

// An empty list literal has no items to take a type from, so its element is `any`; warning
// about it would be crying wolf. Only the LITERAL is recognisable: a name bound to an empty
// list reaches a check as its type alone, and does warn, until a binding can be annotated.
const isEmptyListLiteral = (node: CNode): boolean =>
  node.kind === "array" && node.items.length === 0;

function checkCompat(
  actual: Type,
  expected: Type,
  slot: Slot,
  ctx: AnalysisContext,
  kind: AnalysisErrorKind,
): void {
  const { name, source } = slot;
  if (!isCompatible(actual, expected, ctx.descriptor)) {
    // An incompatibility is about the SLOT: which argument is wrong.
    ctx.errors.push({
      kind,
      name,
      message: `${slot.label} has type '${typeToString(actual)}', which is not compatible with expected '${typeToString(expected)}'`,
      source,
    });
  } else if (castsAny(actual, expected) && !isEmptyListLiteral(slot.node)) {
    // An implicit cast is about the VALUE, so it is named as the reader wrote it.
    const subject = writtenAs(slot.node);
    ctx.warnings.push({
      kind: "implicit_any_cast",
      name,
      message: `${subject ? `'${subject}'` : slot.label} is '${typeToString(actual)}' typed - '${typeToString(expected)}' expected`,
      source,
    });
  }
}

function errorNode(type?: Type, source?: SourceRef): CErrorNode {
  return { kind: "error", type, source, dependsOn: new Set() };
}

// Contextual typing: when an inline lambda flows into a function-typed slot, fill its
// untyped params from the expected param types so the body sees precise types
// (e.g. `item` is `number` inside `Filter(numbers, item => …)`). Annotated params and
// non-lambda args are left untouched; an arity mismatch is left for checkCompat to flag.
function withExpectedParams(node: ASTNode, expected: Type): ASTNode {
  if (node.kind !== "lambda" || expected.kind !== "function") return node;
  if (node.params.length !== expected.params.length) return node;
  return {
    ...node,
    params: node.params.map((p, i) => (p.type ? p : { ...p, type: expected.params[i] })),
  };
}

type FunctionType = Extract<Type, { kind: "function" }>;

// Resolve an application's positional + named args into one list aligned to the
// callee's params (param order). Records app_argument_mismatch errors for arity
// overflow, unknown or duplicate param names, and any param left unbound. Returns the
// slot array and whether resolution failed - arg analysis/type-checking is the caller's.
function resolveAppArgs(
  node: AppNode,
  calleeType: FunctionType,
  ctx: AnalysisContext,
): { slots: (ASTNode | undefined)[]; failed: boolean } {
  const arity = calleeType.params.length;
  const slots: (ASTNode | undefined)[] = new Array(arity).fill(undefined);
  let failed = false;
  const fail = (name: string, message: string) => {
    ctx.errors.push({ kind: "app_argument_mismatch", name, message, source: node.source });
    failed = true;
  };

  if (node.positional.length > arity) {
    fail(
      "(app)",
      `Too many positional arguments: ${node.positional.length} for ${arity} parameter(s)`,
    );
  }
  node.positional.forEach((arg, i) => {
    if (i < arity) slots[i] = arg;
  });

  for (const [argName, arg] of Object.entries(node.named)) {
    const idx = calleeType.paramNames?.indexOf(argName) ?? -1;
    if (!calleeType.paramNames) {
      fail(
        argName,
        `Named argument '${argName}' cannot be resolved - the callee's parameter names are unknown`,
      );
    } else if (idx === -1) {
      fail(argName, `Unknown parameter name '${argName}'`);
    } else if (slots[idx] !== undefined) {
      fail(argName, `Parameter '${argName}' is bound by both a positional and a named argument`);
    } else {
      slots[idx] = arg;
    }
  }

  for (let i = 0; i < arity; i++) {
    if (slots[i] === undefined) {
      const pname = calleeType.paramNames?.[i] ?? `#${i}`;
      fail(pname, `Missing argument for parameter '${pname}'`);
    }
  }

  return { slots, failed };
}

function validateInputs(
  rawInputs: Record<string, ASTNode | ASTNode[]>,
  opDef: OpDefinition,
  ctx: AnalysisContext,
  nodeSource?: SourceRef, // the op node's source - for diagnostics with no arg node (absent/unknown inputs)
): {
  analysedInputs: Record<string, CNode | CNode[]>;
  inputTypes: Record<string, Type>;
  inputDependsOn: ReadonlySet<string>;
} {
  const analysedInputs: Record<string, CNode | CNode[]> = {};
  const inputTypes: Record<string, Type> = {};
  const dependsOnAcc = new Set<string>();

  // Function-typed inputs whose type is generic in the other inputs (a predicate over
  // the list's element type) are refined per-op once the earlier inputs have resolved.
  const inferInputTypes = ctx.descriptor.evaluators.get(opDef.name)?.inferInputTypes;

  for (const opInput of opDef.inputs) {
    const { name } = opInput;

    if (opInput.required !== false && !(name in rawInputs)) {
      // Missing-input placeholder: carries declared type and type default.
      // Warning, not error - binding does NOT fail. Distinct from error placeholders.
      if (opInput.variadic) {
        // Variadic absent → empty array, and no type in inputTypes: there is nothing to share.
        analysedInputs[name] = [];
        ctx.warnings.push({
          kind: "missing_op_input",
          name,
          message: `Required input '${name}' of op '${opDef.name}' is absent - using empty array`,
          source: nodeSource,
        });
        continue;
      }
      // Defaults come from named types only; arrays/functions have no registry entry. They are derived.
      // TODO: Double check if arrays and functions are handled correctly.
      const typeDef =
        opInput.type.kind === "name" ? ctx.descriptor.types.get(opInput.type.name) : undefined;
      const defVal = typeDef?.default;
      const value: LiteralValue =
        typeof defVal === "string" || typeof defVal === "number" || typeof defVal === "boolean"
          ? defVal
          : null;
      analysedInputs[name] = { kind: "literal", type: opInput.type, value, dependsOn: new Set() };
      inputTypes[name] = opInput.type;
      ctx.warnings.push({
        kind: "missing_op_input",
        name,
        message: `Required input '${name}' of op '${opDef.name}' is absent - using type default`,
        source: nodeSource,
      });
      // missing-input placeholder has empty dependsOn - nothing to add to dependsOnAcc
      continue;
    }

    if (opInput.variadic) {
      const raw = rawInputs[name];
      const rawArr: ASTNode[] = Array.isArray(raw)
        ? raw
        : raw !== undefined
          ? [raw as ASTNode]
          : [];
      const cItems = rawArr.map((item) => analyseNode(item, ctx));
      for (const ci of cItems) {
        if (ci.kind !== "error")
          checkCompat(
            getOutputType(ci),
            opInput.type,
            { name, label: `Input '${name}' of '${opDef.name}'`, node: ci, source: ci.source },
            ctx,
            "op_input_type_mismatch",
          );
        // Flatten variadic CNode[] dependsOn - array itself has no .dependsOn
        for (const d of ci.dependsOn) dependsOnAcc.add(d);
      }
      analysedInputs[name] = cItems;
      // A variadic input reaches inferOutput as the type its items share - `number[]` for
      // Concat($a, $b) over two number lists - or `any` when they disagree. Without it an op
      // like Concat could only ever say `any[]`, and every lambda over its result got an
      // `any` parameter: an implicit_any_cast on code that is perfectly well typed.
      const itemTypes = cItems.filter((ci) => ci.kind !== "error").map(getOutputType);
      if (itemTypes.length > 0) {
        const [first] = itemTypes as [Type, ...Type[]];
        inputTypes[name] = itemTypes.every((t) => typesEqual(t, first)) ? first : Type.any;
      }
    } else if (name in rawInputs) {
      // Refine the expected type (generic function inputs) and contextually type an
      // inline lambda's untyped params from it before analysing the body.
      const expectedType = inferInputTypes?.(inputTypes)?.[name] ?? opInput.type;
      const cnode = analyseNode(withExpectedParams(rawInputs[name] as ASTNode, expectedType), ctx);
      const actualType = getOutputType(cnode);
      if (cnode.kind !== "error")
        checkCompat(
          actualType,
          expectedType,
          { name, label: `Input '${name}' of '${opDef.name}'`, node: cnode, source: cnode.source },
          ctx,
          "op_input_type_mismatch",
        );
      for (const d of cnode.dependsOn) dependsOnAcc.add(d);
      analysedInputs[name] = cnode;
      inputTypes[name] = actualType;
    }
  }

  // Warn on keys not declared by the op
  for (const key of Object.keys(rawInputs)) {
    if (!opDef.inputs.some((i) => i.name === key)) {
      const rawArg = rawInputs[key];
      const argSource = Array.isArray(rawArg) ? rawArg[0]?.source : rawArg?.source;
      ctx.warnings.push({
        kind: "unknown_op_input_key",
        name: key,
        message: `Input key '${key}' is not declared by op '${opDef.name}'`,
        source: argSource ?? nodeSource,
      });
    }
  }

  return { analysedInputs, inputTypes, inputDependsOn: dependsOnAcc };
}

// Resolve a struct field by searching the type and its `extends` ancestors (most-derived
// wins → an override shadows the inherited field). `hasFields` reports whether ANY type in
// the chain declares fields - i.e. the value is a struct, so a miss is a real error rather
// than the permissive fallback. The `seen` set guards malformed extends cycles.
function resolveField(
  typeName: string,
  field: string,
  descriptor: LanguageDescriptor,
): { type: Type | undefined; hasFields: boolean } {
  let current: string | undefined = typeName;
  const seen = new Set<string>();
  let hasFields = false;
  while (current && !seen.has(current)) {
    seen.add(current);
    const def = descriptor.types.get(current);
    if (!def) break;
    if (def.fields) {
      hasFields = true;
      const t = def.fields[field];
      if (t) return { type: t, hasFields: true };
    }
    current = def.extends;
  }
  return { type: undefined, hasFields };
}

function analyseNode(node: ASTNode, ctx: AnalysisContext): CNode {
  switch (node.kind) {
    case "literal": {
      const type =
        node.value === null
          ? Type.null
          : typeof node.value === "string"
            ? Type.string
            : typeof node.value === "number"
              ? Type.number
              : typeof node.value === "boolean"
                ? Type.boolean
                : Type.any;
      return { ...node, type, dependsOn: new Set() };
    }

    case "input": {
      const def = ctx.descriptor.inputs.get(node.name);
      if (!def) {
        ctx.errors.push({
          kind: "unknown_program_input",
          name: node.name,
          message: `Context input '${node.name}' is not declared in the descriptor`,
          source: node.source,
        });
        return errorNode(undefined, node.source);
      }
      return { ...node, type: def.type, dependsOn: new Set([node.name]) };
    }

    case "ref": {
      // Local-first: a lambda param / scoped var shadows a same-named global binding.
      // Scoped vars are not context inputs - dependsOn is empty.
      if (ctx.localBindings.has(node.name)) {
        return {
          ...node,
          type: ctx.localBindings.get(node.name) ?? Type.any,
          dependsOn: new Set(),
        };
      }

      if (ctx.analysedBindings.has(node.name)) {
        if (ctx.failedBindings.has(node.name)) return errorNode(undefined, node.source); // cascade suppression

        // Lexical order: the line reading a name must come after the line declaring it. One
        // index numbers every statement - a binding or an output alike - so this is the same
        // comparison whichever kind of line is reading. bindingSourceRefs is for messages only.
        if (ctx.enforceCodeOrder && ctx.currentDeclarationIndex !== undefined) {
          const referencedIndex = ctx.declarationIndex.get(node.name);
          if (referencedIndex !== undefined && referencedIndex > ctx.currentDeclarationIndex) {
            const declaredAt = ctx.bindingSourceRefs.get(node.name);
            ctx.errors.push({
              kind: "forward_reference",
              name: node.name,
              source: node.source,
              message:
                `'${node.name}' is referenced before it is declared` +
                (declaredAt?.kind === "code" ? ` (declared at line ${declaredAt.line})` : ""),
            });
            return errorNode(undefined, node.source);
          }
        }

        // A stated type wins over the inferred one: `let none: number[] = []` is a number[]
        // to everything that reads it, which is what the annotation is for.
        const binding = ctx.analysedBindings.get(node.name)!;
        const type = ctx.annotations.get(node.name) ?? getOutputType(binding);
        return { ...node, type, dependsOn: binding.dependsOn };
      }

      ctx.errors.push({
        kind: "undeclared_binding_reference",
        name: node.name,
        message: `'${node.name}' is not declared as a binding or scoped variable`,
        source: node.source,
      });
      return errorNode(undefined, node.source);
    }

    case "array": {
      const cItems = node.items.map((item) => analyseNode(item, ctx));
      // Element type is inferred from the items: homogeneous → that type, mixed or empty
      // → any. (Heterogeneous arrays via union types / generics are deferred - see
      // .docs/todo.md.) The parser's placeholder `node.type` (any) is overridden here.
      const itemTypes = cItems.filter((ci) => ci.kind !== "error").map(getOutputType);
      const elementType =
        itemTypes.length > 0 && itemTypes.every((t) => typesEqual(t, itemTypes[0]))
          ? itemTypes[0]
          : Type.any;
      return {
        ...node,
        type: elementType,
        items: cItems,
        dependsOn: union(...cItems.map((n) => n.dependsOn)),
      };
    }

    case "field": {
      const struct = analyseNode(node.struct, ctx);
      const structType = getOutputType(struct);

      // A struct type (a named type with `fields`, directly or inherited via its `extends`
      // chain) gets checked field access: a known field's type is inferred - and since that
      // type can itself be a named struct, getOutputType resolves the next `.field` the same
      // way (multilevel) - while an unknown field on a struct errors. Non-struct named types
      // keep the permissive fallback (type stays the parser's `any`; primitives warn).
      let fieldType: Type = node.type;
      if (structType.kind === "name") {
        const resolved = resolveField(structType.name, node.field, ctx.descriptor);
        if (resolved.type) {
          fieldType = resolved.type;
        } else if (resolved.hasFields) {
          if (struct.kind !== "error") {
            ctx.errors.push({
              kind: "unknown_field",
              name: node.field,
              message: `Type '${typeToString(structType)}' has no field '${node.field}'`,
              source: node.source,
            });
            return errorNode(undefined, node.source);
          }
        } else if (["string", "number", "boolean"].includes(structType.name)) {
          ctx.warnings.push({
            kind: "field_access_on_primitive",
            name: node.field,
            message: `Field access '${node.field}' on primitive type '${typeToString(structType)}'`,
            source: node.source,
          });
        }
      }
      return { ...node, type: fieldType, struct, dependsOn: struct.dependsOn };
    }

    case "operation": {
      const opDef = ctx.descriptor.ops.get(node.op);
      if (!opDef) {
        ctx.errors.push({
          kind: "unknown_op",
          name: node.op,
          message: `Op '${node.op}' is not registered in the descriptor`,
          source: node.source,
        });
        return errorNode(undefined, node.source);
      }
      const { analysedInputs, inputTypes, inputDependsOn } = validateInputs(
        node.inputs,
        opDef,
        ctx,
        node.source,
      );
      const evaluator = ctx.descriptor.evaluators.get(node.op);
      const output = evaluator?.inferOutput?.(inputTypes) ?? opDef.output;
      return { ...node, inputs: analysedInputs, output, dependsOn: inputDependsOn };
    }

    case "lambda": {
      // A name written in an annotation has to exist, or every check downstream compares
      // against a type that is not there.
      const written = [...node.params.map((p) => p.type), node.returnType];
      const unknown = written.filter((t) => t && reportUnknownTypes(t, ctx, node.source));
      if (unknown.length > 0) return errorNode(undefined, node.source);
      // Bind params into the local scope (untyped → any, gradual), then analyse the
      // body in that extended scope. Nested lambdas recurse naturally, layering more
      // params onto localBindings.
      const paramTypes = node.params.map((p) => p.type ?? Type.any);
      const lambdaScope = new Map(ctx.localBindings);
      node.params.forEach((p, i) => lambdaScope.set(p.name, paramTypes[i]));

      const body = analyseNode(node.body, { ...ctx, localBindings: lambdaScope });
      const bodyReturn = getOutputType(body);

      // Optional return annotation: the body must be compatible with it.
      if (node.returnType && body.kind !== "error") {
        checkCompat(
          bodyReturn,
          node.returnType,
          {
            name: "(lambda return)",
            label: "The lambda's return",
            node: body,
            source: node.source,
          },
          ctx,
          "lambda_return_type_mismatch",
        );
      }

      // Declared return (the annotation) is the contract when present, else inferred.
      // Param refs contribute ∅ dependsOn, so body.dependsOn is exactly the lambda's
      // free global/input deps the function's dependsOn. paramNames ride along on the
      // type so application sites can resolve named arguments.
      const type = Type.fn(
        paramTypes,
        node.returnType ?? bodyReturn,
        node.params.map((p) => p.name),
      );
      // returnType is intentionally dropped: `type.returns` is now the source of truth.
      return {
        kind: "lambda",
        params: node.params,
        body,
        type,
        source: node.source,
        dependsOn: body.dependsOn,
      };
    }

    case "app": {
      const callee = analyseNode(node.callee, ctx);
      if (callee.kind === "error") return errorNode(undefined, node.source);

      const calleeType = getOutputType(callee);
      if (calleeType.kind !== "function") {
        ctx.errors.push({
          kind: "app_callee_not_function",
          name: "(app callee)",
          message: `Application callee has type '${typeToString(calleeType)}', which is not a function`,
          source: node.source,
        });
        return errorNode(undefined, node.source);
      }

      // Resolve positional + named args into one list aligned to the params.
      const { slots, failed } = resolveAppArgs(node, calleeType, ctx);
      if (failed) return errorNode(calleeType.returns, node.source);

      // All slots filled: analyse each arg and type-check it against its param.
      const args: CNode[] = [];
      const deps = new Set<string>(callee.dependsOn);
      for (let i = 0; i < slots.length; i++) {
        const ca = analyseNode(slots[i]!, ctx);
        if (ca.kind !== "error") {
          const param = calleeType.paramNames?.[i] ?? `#${i}`;
          checkCompat(
            getOutputType(ca),
            calleeType.params[i],
            { name: param, label: `Argument '${param}'`, node: ca, source: ca.source },
            ctx,
            "app_argument_type_mismatch",
          );
        }
        for (const d of ca.dependsOn) deps.add(d);
        args.push(ca);
      }

      // dependsOn = callee ∪ args. The body's free deps already ride along on the
      // callee (a ref to a lambda binding carries the lambda's body deps), so no
      // special-casing is needed.
      return {
        kind: "app",
        callee,
        args,
        type: calleeType.returns,
        source: node.source,
        dependsOn: deps,
      };
    }
  }
}

// Collect every named-type reference inside a Type (arrays/functions recurse; the
// structural arms carry no name of their own).
function collectTypeNames(t: Type, into: Set<string>): void {
  switch (t.kind) {
    case "name":
      into.add(t.name);
      break;
    case "array":
      collectTypeNames(t.element, into);
      break;
    case "function":
      t.params.forEach((p) => collectTypeNames(p, into));
      collectTypeNames(t.returns, into);
      break;
  }
}

// A type WRITTEN in a program - an annotation, a lambda parameter - must name registered
// types, the way a declaration must (validateDescriptor). The parser cannot check it: it has the
// vocabulary alone, and a layer type such as `Bus` arrives with the composed descriptor. A Type
// has no span of its own, so the error points at the statement or the lambda that wrote it.
// Returns whether anything was reported.
function reportUnknownTypes(t: Type, ctx: AnalysisContext, source: SourceRef | undefined): boolean {
  const names = new Set<string>();
  collectTypeNames(t, names);
  let reported = false;
  for (const name of names) {
    if (ctx.descriptor.types.has(name)) continue;
    ctx.errors.push({
      kind: "unknown_type",
      name,
      message: `Type '${name}' is not registered`,
      source,
    });
    reported = true;
  }
  return reported;
}

//? validateDescriptor: referential integrity of a language definition. Every named-type
// reference (op inputs/outputs, input/output types, struct `fields`, `extends`) must
// resolve to a registered type - a dangling reference (typo, forgotten registerType) is
// an `unknown_port_type` error. A registered-but-fieldless type is fine (an opaque handle);
// only UNregistered names are flagged. Run once when the language is assembled.
export function validateDescriptor(descriptor: LanguageDescriptor): AnalysisError[] {
  const errors: AnalysisError[] = [];
  const report = (name: string, where: string, subject: ErrorSubject) => {
    if (!descriptor.types.has(name)) {
      errors.push({
        kind: "unknown_port_type",
        name,
        message: `Type '${name}' is referenced by ${where} but is not registered`,
        subject,
      });
    }
  };
  const checkType = (t: Type, where: string, subject: ErrorSubject) => {
    const names = new Set<string>();
    collectTypeNames(t, names);
    for (const name of names) report(name, where, subject);
  };

  for (const def of descriptor.types.values()) {
    const subject: ErrorSubject = { kind: "type", name: def.name };
    if (def.extends) report(def.extends, `type '${def.name}' (extends)`, subject);
    if (def.fields) {
      for (const [field, t] of Object.entries(def.fields)) {
        checkType(t, `type '${def.name}' field '${field}'`, subject);
      }
    }
  }
  for (const op of descriptor.ops.values()) {
    const subject: ErrorSubject = { kind: "op", name: op.name };
    for (const input of op.inputs) {
      checkType(input.type, `op '${op.name}' input '${input.name}'`, subject);
    }
    checkType(op.output, `op '${op.name}' output`, subject);
  }
  for (const input of descriptor.inputs.values()) {
    checkType(input.type, `input '${input.name}'`, { kind: "input", name: input.name });
  }
  for (const output of descriptor.outputs.values()) {
    checkType(output.type, `output '${output.name}'`, { kind: "output", name: output.name });
  }

  // Op ↔ evaluator pairing: an op without an evaluator only fails at RUNTIME
  // (evaluator_not_found), and an evaluator without an op is dead code or a typo.
  // Both are language-definition bugs, caught here at assembly instead.
  for (const op of descriptor.ops.values()) {
    if (!descriptor.evaluators.has(op.name)) {
      errors.push({
        kind: "missing_evaluator",
        name: op.name,
        message: `Op '${op.name}' has no registered evaluator`,
        subject: { kind: "op", name: op.name },
      });
    }
  }
  for (const evaluator of descriptor.evaluators.values()) {
    if (!descriptor.ops.has(evaluator.op)) {
      errors.push({
        kind: "orphan_evaluator",
        name: evaluator.op,
        message: `Evaluator registered for unknown op '${evaluator.op}'`,
        subject: { kind: "op", name: evaluator.op },
      });
    }
  }

  // Struct subtyping soundness: a field a type re-declares must be compatible with the
  // same field inherited from its `extends` parent (covariant override, sound under
  // read-only access). Width is automatic via inheritance, so only overrides can break
  // it - this makes a declared `Derived extends Base` genuinely guarantee a Derived is
  // usable as a Base. (A new field not present in the parent is fine.)
  for (const def of descriptor.types.values()) {
    if (!def.extends || !def.fields) continue;
    for (const [field, ownType] of Object.entries(def.fields)) {
      const inherited = resolveField(def.extends, field, descriptor).type;
      if (inherited && !isCompatible(ownType, inherited, descriptor)) {
        errors.push({
          kind: "incompatible_field_override",
          name: field,
          message: `Field '${field}' of '${def.name}' has type '${typeToString(ownType)}', incompatible with '${typeToString(inherited)}' inherited from '${def.extends}'`,
          subject: { kind: "type", name: def.name },
        });
      }
    }
  }

  return errors;
}

export function analyse(program: RawProgram, descriptor: LanguageDescriptor): AnalysisResult {
  // Pass 1 - reference graph + declaration index + source refs.
  const refGraph = buildReferenceGraph(program);
  const errors: AnalysisError[] = [];
  const warnings: AnalysisWarning[] = [];

  // Pass 2 - topological order (deps first) + cycle detection, then per-output reachability.
  const { order, failedBindings } = topoSort(
    refGraph.bindingNames,
    refGraph.graph,
    refGraph.bindingSourceRefs,
    errors,
  );
  const outputReachable = computeReachability(program, refGraph.graph, refGraph.bindingNames);
  // globalReachable - union over ALL outputs. Used ONLY for unused_binding (Pass 5).
  const globalReachable = new Set([...outputReachable.values()].flatMap((s) => [...s]));

  const ctx: AnalysisContext = {
    descriptor,
    analysedBindings: new Map(),
    failedBindings,
    annotations: program.annotations ?? new Map(),
    localBindings: new Map(),
    declarationIndex: refGraph.declarationIndex,
    bindingSourceRefs: refGraph.bindingSourceRefs,
    currentDeclarationIndex: undefined,
    enforceCodeOrder: refGraph.enforceCodeOrder,
    errors,
    warnings,
  };

  // Pass 3 - analyse bindings in topological order.
  analyseBindings(program, order, ctx);

  // Pass 4 - validate outputs (output-granular soundness).
  const { outputMap, ok } = validateOutputs(
    program,
    descriptor,
    ctx,
    outputReachable,
    refGraph.outputIndex,
  );

  // Pass 4.5 / 5 - prune unreachable bindings and warn on unused ones.
  const prunedBindings = pruneBindings(ctx.analysedBindings, outputMap, outputReachable);
  warnUnusedBindings(program, globalReachable, ctx);

  return {
    ok,
    program: { bindings: prunedBindings, outputs: outputMap },
    errors: ctx.errors,
    warnings: ctx.warnings,
  };
}

// ── analyse passes ─────────────────────────────────────────────────────────────

interface ReferenceGraph {
  bindingNames: Set<string>;
  bindingSourceRefs: Map<string, SourceRef>;
  /** Each binding's place in the program's text, in one numbering with the outputs'. */
  declarationIndex: Map<string, number>;
  /** Each output's place, in the same numbering, so an output is checked as a binding is. */
  outputIndex: Map<string, number>;
  graph: Map<string, Set<string>>; // binding → bindings it references
  enforceCodeOrder: boolean; // false once any statement lacks a code source (rete/mixed)
}

// Pass 1 - one iteration over the bindings: collect names, each binding's source ref, the
// reference graph, and whether code order should be enforced; then one declaration order for
// every statement.
function buildReferenceGraph(program: RawProgram): ReferenceGraph {
  const bindingNames = new Set(program.bindings.keys());
  const bindingSourceRefs = new Map<string, SourceRef>();
  const graph = new Map<string, Set<string>>();
  let enforceCodeOrder = true;

  for (const [name, rawNode] of program.bindings) {
    if (rawNode.source?.kind === "code") {
      // TODO: Should all editors not enforce lexical order? Rete should be able to compile to it.
      bindingSourceRefs.set(name, rawNode.source);
    } else {
      enforceCodeOrder = false; // rete source or absent → skip lexical order check
    }
    graph.set(name, collectRefs(rawNode, bindingNames));
  }

  // A program keeps its bindings and its outputs in two maps, so only the text says how they
  // interleave: every statement, numbered in the order it is written. Bindings keep their own
  // relative order either way - the parser adds them in text order - so for bindings this is
  // the same index it always was, with the outputs slotted in between them.
  type Statement = { name: string; output: boolean; line: number; column: number };
  const statements: Statement[] = [];
  for (const [name, node] of program.bindings) {
    const at = node.source?.kind === "code" ? node.source : { line: 0, column: 0 };
    statements.push({ name, output: false, line: at.line, column: at.column });
  }
  // An output takes part only when order is enforced and it has a place in the text; one that
  // does not simply goes unchecked, rather than switching the rule off for the bindings.
  if (enforceCodeOrder) {
    for (const [name, node] of program.outputs) {
      if (node.source?.kind !== "code") continue;
      statements.push({ name, output: true, line: node.source.line, column: node.source.column });
    }
    statements.sort((a, b) => a.line - b.line || a.column - b.column);
  }

  const declarationIndex = new Map<string, number>();
  const outputIndex = new Map<string, number>();
  statements.forEach((statement, index) =>
    (statement.output ? outputIndex : declarationIndex).set(statement.name, index),
  );
  return {
    bindingNames,
    bindingSourceRefs,
    declarationIndex,
    outputIndex,
    graph,
    enforceCodeOrder,
  };
}

// Pass 2 - DFS topological sort over the reference graph with cycle detection. Each
// cycle member gets a binding_cycle error and is marked failed; the rest are returned
// in dependency order (deps before dependents).
function topoSort(
  bindingNames: Set<string>,
  graph: Map<string, Set<string>>,
  bindingSourceRefs: ReadonlyMap<string, SourceRef>,
  errors: AnalysisError[],
): { order: string[]; failedBindings: Set<string> } {
  const failedBindings = new Set<string>();
  const order: string[] = [];
  const dfsStack: string[] = [];
  const visitState = new Map<string, "unvisited" | "visiting" | "visited">();
  for (const name of bindingNames) visitState.set(name, "unvisited");

  function visit(name: string): void {
    if (visitState.get(name) === "visited") return;
    if (visitState.get(name) === "visiting") {
      // Back-edge: extract only the cycle, not the full stack prefix.
      // If a → b → c → b, stack is [a, b, c] when b is revisited.
      // Cycle = [b, c]; a is NOT cycled and remains analysable.
      const cycleStart = dfsStack.indexOf(name);
      for (const member of dfsStack.slice(cycleStart)) {
        errors.push({
          kind: "binding_cycle",
          name: member,
          message: `'${member}' is part of a reference cycle`,
          source: bindingSourceRefs.get(member),
        });
        failedBindings.add(member);
      }
      return;
    }
    visitState.set(name, "visiting");
    dfsStack.push(name);
    for (const dep of graph.get(name) ?? []) visit(dep);
    dfsStack.pop();
    visitState.set(name, "visited");
    order.push(name);
  }
  for (const name of bindingNames) visit(name);
  return { order, failedBindings };
}

// Per-output reachability: the bindings each output transitively pulls in. collectRefs
// runs the FULL output AST, so inline operations referencing deep bindings are captured.
// Used for poison propagation (Pass 4) and pruning (Pass 4.5).
function computeReachability(
  program: RawProgram,
  graph: Map<string, Set<string>>,
  bindingNames: Set<string>,
): Map<string, Set<string>> {
  const outputReachable = new Map<string, Set<string>>();
  for (const [outputName, outputNode] of program.outputs) {
    const reachable = new Set<string>();
    const markReachable = (n: string) => {
      if (reachable.has(n)) return;
      reachable.add(n);
      for (const dep of graph.get(n) ?? []) markReachable(dep);
    };
    for (const n of collectRefs(outputNode, bindingNames)) markReachable(n);
    outputReachable.set(outputName, reachable);
  }
  return outputReachable;
}

// Pass 3 - analyse bindings in topological order (deps first). A binding that emits a
// new error is marked failed; cascade suppression in the 'ref' case stops dependents
// from double-reporting. Error-count-delta is reliable BECAUSE of the topo order.
function analyseBindings(program: RawProgram, order: string[], ctx: AnalysisContext): void {
  for (const name of order) {
    if (ctx.failedBindings.has(name)) continue;
    const errorsBefore = ctx.errors.length;
    const rawNode = program.bindings.get(name)!;
    const cnode = analyseNode(rawNode, {
      ...ctx,
      currentDeclarationIndex: ctx.declarationIndex.get(name),
    });
    ctx.analysedBindings.set(name, cnode);
    // A stated type is a claim about the value: check the value against it. The check sits
    // inside the error window, so a mismatch fails the binding like any other error, and a
    // value of the wrong type never flows on under a type it does not have.
    const annotation = ctx.annotations.get(name);
    if (
      annotation &&
      cnode.kind !== "error" &&
      !reportUnknownTypes(annotation, ctx, rawNode.source)
    ) {
      checkCompat(
        getOutputType(cnode),
        annotation,
        { name, label: `Binding '${name}'`, node: cnode, source: rawNode.source },
        ctx,
        "binding_type_mismatch",
      );
    }
    if (ctx.errors.length > errorsBefore) ctx.failedBindings.add(name);
  }
}

// Pass 4 - validate each declared output: drop those depending on a poisoned binding,
// analyse the rest, type-check known outputs against the descriptor, and report
// descriptor outputs the program omits. ok is false ONLY when a required output is lost.
function validateOutputs(
  program: RawProgram,
  descriptor: LanguageDescriptor,
  ctx: AnalysisContext,
  outputReachable: Map<string, Set<string>>,
  outputIndex: Map<string, number>,
): { outputMap: Map<string, CNode>; ok: boolean } {
  const outputMap = new Map<string, CNode>();
  let okFlag = true;

  // TODO: Check if the program should still compile if a required output is missing.
  for (const [name, rawNode] of program.outputs) {
    const def = descriptor.outputs.get(name);
    const isKnownOutput = def !== undefined;

    // Step 1: Drop outputs whose binding dependencies were poisoned.
    const reachable = outputReachable.get(name) ?? new Set<string>();
    const hasPoisonedDep = [...reachable].some((b) => ctx.failedBindings.has(b));
    if (hasPoisonedDep) {
      if (isKnownOutput) {
        ctx.errors.push({
          kind: "output_depends_on_failed_binding",
          name,
          message: `Output '${name}' depends on a binding that failed analysis`,
          source: rawNode.source,
        });
        // TODO: Add some sort of feedback depending on the required mode?
        if (!def.mode || def.mode === "required") okFlag = false;
      } else {
        // Unknown output + poisoned dep: warn only. Cannot affect okFlag.
        ctx.warnings.push({
          kind: "unknown_program_output",
          name,
          message: `Output '${name}' is not in the descriptor and depends on a failed binding`,
          source: rawNode.source,
        });
      }
      continue;
    }

    // Step 2: Analyse the output node itself.
    const errorsBefore = ctx.errors.length;
    const cnode = analyseNode(rawNode, { ...ctx, currentDeclarationIndex: outputIndex.get(name) });
    if (ctx.errors.length > errorsBefore) {
      if (isKnownOutput && (!def.mode || def.mode === "required")) okFlag = false;
      continue;
    }

    // Step 3: Type-check against descriptor (known outputs only).
    if (isKnownOutput) {
      const actualType = getOutputType(cnode);
      if (!isCompatible(actualType, def.type, descriptor)) {
        ctx.errors.push({
          kind: "program_output_type_mismatch",
          name,
          message: `Output '${name}' type '${typeToString(actualType)}' is not compatible with expected '${typeToString(def.type)}'`,
          source: rawNode.source,
        });
        if (!def.mode || def.mode === "required") okFlag = false;
        continue;
      }
      if (castsAny(actualType, def.type) && !isEmptyListLiteral(cnode)) {
        ctx.warnings.push({
          kind: "implicit_any_cast",
          name,
          message: `Output '${name}' is '${typeToString(actualType)}' typed - '${typeToString(def.type)}' expected`,
          source: rawNode.source,
        });
      }
      outputMap.set(name, cnode);
    } else {
      ctx.warnings.push({
        kind: "unknown_program_output",
        name,
        message: `Output '${name}' is not declared in the descriptor`,
        source: rawNode.source,
      });
      outputMap.set(name, cnode); // included; caller is warned
    }
  }

  // Check descriptor outputs not declared in the program at all.
  // Uses program.outputs (all declared), not outputMap (survivors), to avoid double-counting.
  for (const [name, def] of descriptor.outputs) {
    if (!program.outputs.has(name)) {
      if (def.mode === "required") {
        ctx.errors.push({
          kind: "missing_required_program_output",
          name,
          message: `Required output '${name}' is not declared in the program`,
        });
        okFlag = false;
      } else if (def.mode === "desired") {
        ctx.warnings.push({
          kind: "missing_desired_program_output",
          name,
          message: `Desired output '${name}' is not declared in the program`,
        });
      }
    }
  }

  return { outputMap, ok: okFlag };
}

// Pass 4.5 - keep only bindings reachable from a SURVIVING output. Error placeholders
// live in failed bindings, which are unreachable from surviving outputs, so they fall
// away here.
function pruneBindings(
  analysedBindings: ReadonlyMap<string, CNode>,
  outputMap: Map<string, CNode>,
  outputReachable: Map<string, Set<string>>,
): Map<string, CNode> {
  const survivingReachable = new Set<string>();
  for (const name of outputMap.keys()) {
    for (const b of outputReachable.get(name) ?? []) survivingReachable.add(b);
  }
  return new Map([...analysedBindings].filter(([name]) => survivingReachable.has(name)));
}

// Pass 5 - warn on bindings no output references. globalReachable spans ALL declared
// outputs, so a binding used only by a dropped output is NOT reported as unused.
function warnUnusedBindings(
  program: RawProgram,
  globalReachable: Set<string>,
  ctx: AnalysisContext,
): void {
  for (const name of program.bindings.keys()) {
    if (!globalReachable.has(name)) {
      ctx.warnings.push({
        kind: "unused_binding",
        name,
        message: `Binding '${name}' is declared but never referenced by any output`,
        source: ctx.bindingSourceRefs.get(name),
      });
    }
  }
}
