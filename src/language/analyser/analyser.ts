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
import { Type, isAny, isAnyOrNull, typeToString } from "../infra/types";
import {
  AnalysisContext,
  AnalysisError,
  AnalysisErrorKind,
  AnalysisResult,
  AnalysisWarning,
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

function checkCompat(
  actual: Type,
  expected: Type,
  name: string,
  ctx: AnalysisContext,
  kind: AnalysisErrorKind = "op_input_type_mismatch",
  source?: SourceRef,
): void {
  if (!isCompatible(actual, expected, ctx.descriptor)) {
    ctx.errors.push({
      kind,
      name,
      message: `Input '${name}' type '${typeToString(actual)}' is not compatible with expected '${typeToString(expected)}'`,
      source,
    });
  } else if (isAnyOrNull(actual) && !isAny(expected)) {
    ctx.warnings.push({
      kind: "implicit_any_cast",
      name,
      message: `Input '${name}' is 'any' typed - '${typeToString(expected)}' expected`,
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
        // Variadic absent → empty array. Not added to inputTypes (same as populated variadic).
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
            name,
            ctx,
            "op_input_type_mismatch",
            ci.source,
          );
        // Flatten variadic CNode[] dependsOn - array itself has no .dependsOn
        for (const d of ci.dependsOn) dependsOnAcc.add(d);
      }
      analysedInputs[name] = cItems;
      // variadic NOT added to inputTypes - inferOutput/inferInputTypes must not rely on it
    } else if (name in rawInputs) {
      // Refine the expected type (generic function inputs) and contextually type an
      // inline lambda's untyped params from it before analysing the body.
      const expectedType = inferInputTypes?.(inputTypes)?.[name] ?? opInput.type;
      const cnode = analyseNode(withExpectedParams(rawInputs[name] as ASTNode, expectedType), ctx);
      const actualType = getOutputType(cnode);
      if (cnode.kind !== "error")
        checkCompat(actualType, expectedType, name, ctx, "op_input_type_mismatch", cnode.source);
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

        // Lexical order check by declaration index - formatting-independent.
        // declarationIndex is the source of truth; bindingSourceRefs is for error messages only.
        if (ctx.enforceCodeOrder && ctx.currentBindingIndex !== undefined) {
          const referencedIndex = ctx.declarationIndex.get(node.name);
          if (referencedIndex !== undefined && referencedIndex > ctx.currentBindingIndex) {
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

        const binding = ctx.analysedBindings.get(node.name)!;
        return { ...node, type: getOutputType(binding), dependsOn: binding.dependsOn };
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
      // TODO: How is node.type set? Should it not be derived from the items? Maybe track a most strict and least strict type and set it to least, unless it's less strict or different then parent, then error or warning.
      for (const ci of cItems) {
        if (ci.kind !== "error")
          checkCompat(
            getOutputType(ci),
            node.type,
            "(array item)",
            ctx,
            "op_input_type_mismatch",
            ci.source,
          );
      }
      return { ...node, items: cItems, dependsOn: union(...cItems.map((n) => n.dependsOn)) };
    }

    case "field": {
      const struct = analyseNode(node.struct, ctx);
      const structType = getOutputType(struct);
      if (structType.kind === "name" && ["string", "number", "boolean"].includes(structType.name)) {
        // TODO: Should this be an error?
        ctx.warnings.push({
          kind: "field_access_on_primitive",
          name: node.field,
          message: `Field access '${node.field}' on primitive type '${typeToString(structType)}'`,
          source: node.source,
        });
      }
      return { ...node, struct, dependsOn: struct.dependsOn };
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
          "(lambda return)",
          ctx,
          "lambda_return_type_mismatch",
          node.source,
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
      const arity = calleeType.params.length;
      const slots: (ASTNode | undefined)[] = new Array(arity).fill(undefined);
      let resolutionFailed = false;

      if (node.positional.length > arity) {
        ctx.errors.push({
          kind: "app_argument_mismatch",
          name: "(app)",
          message: `Too many positional arguments: ${node.positional.length} for ${arity} parameter(s)`,
          source: node.source,
        });
        resolutionFailed = true;
      }
      node.positional.forEach((arg, i) => {
        if (i < arity) slots[i] = arg;
      });

      for (const [argName, arg] of Object.entries(node.named)) {
        const idx = calleeType.paramNames?.indexOf(argName) ?? -1;
        if (!calleeType.paramNames) {
          ctx.errors.push({
            kind: "app_argument_mismatch",
            name: argName,
            message: `Named argument '${argName}' cannot be resolved - the callee's parameter names are unknown`,
            source: node.source,
          });
          resolutionFailed = true;
        } else if (idx === -1) {
          ctx.errors.push({
            kind: "app_argument_mismatch",
            name: argName,
            message: `Unknown parameter name '${argName}'`,
            source: node.source,
          });
          resolutionFailed = true;
        } else if (slots[idx] !== undefined) {
          ctx.errors.push({
            kind: "app_argument_mismatch",
            name: argName,
            message: `Parameter '${argName}' is bound by both a positional and a named argument`,
            source: node.source,
          });
          resolutionFailed = true;
        } else {
          slots[idx] = arg;
        }
      }

      for (let i = 0; i < arity; i++) {
        if (slots[i] === undefined) {
          const pname = calleeType.paramNames?.[i] ?? `#${i}`;
          ctx.errors.push({
            kind: "app_argument_mismatch",
            name: pname,
            message: `Missing argument for parameter '${pname}'`,
            source: node.source,
          });
          resolutionFailed = true;
        }
      }

      if (resolutionFailed) return errorNode(calleeType.returns, node.source);

      // All slots filled: analyse each arg and type-check it against its param.
      const args: CNode[] = [];
      const deps = new Set<string>(callee.dependsOn);
      for (let i = 0; i < arity; i++) {
        const ca = analyseNode(slots[i]!, ctx);
        if (ca.kind !== "error") {
          checkCompat(
            getOutputType(ca),
            calleeType.params[i],
            calleeType.paramNames?.[i] ?? `#${i}`,
            ctx,
            "app_argument_type_mismatch",
            ca.source,
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

export function analyse(program: RawProgram, descriptor: LanguageDescriptor): AnalysisResult {
  // Pass 1 - Collect source refs + declaration index + reference graph (single iteration)
  const bindingNames = new Set(program.bindings.keys());
  const bindingSourceRefs = new Map<string, SourceRef>();
  const declarationIndex = new Map<string, number>();
  const graph = new Map<string, Set<string>>();
  let enforceCodeOrder = true;
  let i = 0;

  for (const [name, rawNode] of program.bindings) {
    declarationIndex.set(name, i++);
    if (rawNode.source?.kind === "code") {
      // TODO: Should all editors not enforce lexical order? Rete should be able to compile to it.
      bindingSourceRefs.set(name, rawNode.source);
    } else {
      enforceCodeOrder = false; // rete source or absent → skip lexical order check
    }
    graph.set(name, collectRefs(rawNode, bindingNames));
  }

  // Pass 2 - Topological sort + cycle detection
  const errors: AnalysisError[] = [];
  const warnings: AnalysisWarning[] = [];
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

  // Per-output reachability - used in Pass 4 (poison propagation) and Pass 4.5 (pruning)
  const outputReachable = new Map<string, Set<string>>();
  for (const [outputName, outputNode] of program.outputs) {
    const reachable = new Set<string>();
    const markReachable = (n: string) => {
      if (reachable.has(n)) return;
      reachable.add(n);
      for (const dep of graph.get(n) ?? []) markReachable(dep);
    };
    // collectRefs runs the FULL output AST - inline operations referencing bindings
    // deeper in the tree are captured correctly.
    for (const n of collectRefs(outputNode, bindingNames)) markReachable(n);
    outputReachable.set(outputName, reachable);
  }

  // globalReachable - union over ALL outputs. Used ONLY for unused_binding (Pass 5).
  const globalReachable = new Set([...outputReachable.values()].flatMap((s) => [...s]));

  // Pass 3 - Analyse bindings in topological order
  const ctx: AnalysisContext = {
    descriptor,
    analysedBindings: new Map(),
    failedBindings,
    localBindings: new Map(),
    declarationIndex,
    bindingSourceRefs,
    currentBindingIndex: undefined,
    enforceCodeOrder,
    errors,
    warnings,
  };

  for (const name of order) {
    if (ctx.failedBindings.has(name)) continue;
    const errorsBefore = ctx.errors.length;
    const cnode = analyseNode(program.bindings.get(name)!, {
      ...ctx,
      currentBindingIndex: declarationIndex.get(name),
    });
    ctx.analysedBindings.set(name, cnode);
    if (ctx.errors.length > errorsBefore) ctx.failedBindings.add(name);
    // Error-count-delta is reliable: topo order ensures dependencies are analysed first.
    // If A failed, it's in failedBindings before B is analysed; cascade suppression in
    // the 'ref' case returns a placeholder for A without adding a new error.
  }

  // Pass 4 - Validate outputs (output-granular soundness)
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
    const cnode = analyseNode(rawNode, ctx);
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
      if (isAnyOrNull(actualType) && !isAny(def.type)) {
        ctx.warnings.push({
          kind: "implicit_any_cast",
          name,
          message: `Output '${name}' is 'any' typed - '${typeToString(def.type)}' expected`,
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

  // Pass 4.5 - Prune bindings not reachable from surviving outputs.
  // Error placeholders live in failed bindings, which are unreachable from surviving outputs.
  // survivingReachable uses outputMap.keys() (SURVIVING outputs only).
  const survivingReachable = new Set<string>();
  for (const name of outputMap.keys()) {
    for (const b of outputReachable.get(name) ?? []) survivingReachable.add(b);
  }
  const prunedBindings = new Map(
    [...ctx.analysedBindings].filter(([name]) => survivingReachable.has(name)),
  );

  // Pass 5 - Unused bindings
  // Uses globalReachable (ALL declared outputs) - binding used by a dropped output is not "unused".
  for (const name of program.bindings.keys()) {
    if (!globalReachable.has(name)) {
      ctx.warnings.push({
        kind: "unused_binding",
        name,
        message: `Binding '${name}' is declared but never referenced by any output`,
        source: bindingSourceRefs.get(name),
      });
    }
  }

  return {
    ok: okFlag,
    program: { bindings: prunedBindings, outputs: outputMap },
    errors: ctx.errors,
    warnings: ctx.warnings,
  };
}
