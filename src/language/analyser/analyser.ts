// INVARIANT: analyseNode returns a fresh CNode object on every call - every case
// spreads { ...node, ... } into a new object, and validateInputs constructs each
// missing-input placeholder fresh in its loop. CNode identity is therefore unique
// per position in a CoreProgram. The evaluator's nodeCache/bodyScope are keyed by
// object identity and rely on this; do NOT memoise or share analysed nodes.

import {
  type ASTNode,
  type CErrorNode,
  type CNode,
  type LiteralValue,
  type SourceRef,
} from "../infra/nodes";
import { RawProgram } from "../infra/program";
import { isCompatible, type LanguageDescriptor } from "../infra/registry";
import { Type, isAny, isAnyOrNull, typeToString } from "../infra/types";
import { AnalysisContext, AnalysisError, AnalysisResult, AnalysisWarning } from "./types";

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
      case "higher_order":
        for (const val of Object.values(n.inputs)) {
          if (Array.isArray(val)) for (const v of val) walk(v);
          else walk(val);
        }
        walk(n.body);
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
    case "higher_order":
      return node.output;
    case "error":
      return node.type ?? Type.any;
  }
}

function checkCompat(actual: Type, expected: Type, name: string, ctx: AnalysisContext): void {
  if (!isCompatible(actual, expected, ctx.descriptor)) {
    ctx.errors.push({
      kind: "op_input_type_mismatch",
      name,
      message: `Input '${name}' type '${typeToString(actual)}' is not compatible with expected '${typeToString(expected)}'`,
    });
  } else if (isAnyOrNull(actual) && !isAny(expected)) {
    // TODO: Should null really be castable like any?
    ctx.warnings.push({
      kind: "implicit_any_cast",
      name,
      message: `Input '${name}' is 'any' typed - '${typeToString(expected)}' expected`,
    });
  }
}

function errorNode(type?: Type, source?: SourceRef): CErrorNode {
  return { kind: "error", type, source, dependsOn: new Set() };
}

function validateInputs(
  rawInputs: Record<string, ASTNode | ASTNode[]>,
  opDef: {
    name: string;
    inputs: { name: string; type: Type; required?: boolean; variadic?: boolean }[];
  }, // TODO: Should this be a shared type?
  ctx: AnalysisContext,
): {
  analysedInputs: Record<string, CNode | CNode[]>;
  inputTypes: Record<string, Type>;
  inputDependsOn: ReadonlySet<string>;
} {
  const analysedInputs: Record<string, CNode | CNode[]> = {};
  const inputTypes: Record<string, Type> = {};
  const dependsOnAcc = new Set<string>();

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
        if (ci.kind !== "error") checkCompat(getOutputType(ci), opInput.type, name, ctx);
        // Flatten variadic CNode[] dependsOn - array itself has no .dependsOn
        for (const d of ci.dependsOn) dependsOnAcc.add(d);
      }
      analysedInputs[name] = cItems;
      // variadic NOT added to inputTypes - inferOutput/inferBodyBindings must not rely on it
    } else if (name in rawInputs) {
      const cnode = analyseNode(rawInputs[name] as ASTNode, ctx);
      const actualType = getOutputType(cnode);
      if (cnode.kind !== "error") checkCompat(actualType, opInput.type, name, ctx);
      for (const d of cnode.dependsOn) dependsOnAcc.add(d);
      analysedInputs[name] = cnode;
      inputTypes[name] = actualType;
    }
  }

  // Warn on keys not declared by the op
  for (const key of Object.keys(rawInputs)) {
    if (!opDef.inputs.some((i) => i.name === key)) {
      ctx.warnings.push({
        kind: "unknown_op_input_key",
        name: key,
        message: `Input key '${key}' is not declared by op '${opDef.name}'`,
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
      if (ctx.analysedBindings.has(node.name)) {
        // TODO: Check the use off placeholders. Might be possible to simplify.
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

      if (ctx.boundNames.has(node.name)) {
        // Scoped vars are not context inputs - dependsOn is empty
        return { ...node, type: ctx.boundNames.get(node.name) ?? Type.any, dependsOn: new Set() };
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
        if (ci.kind !== "error") checkCompat(getOutputType(ci), node.type, "(array item)", ctx);
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
      if (opDef.higherOrder) {
        ctx.errors.push({
          kind: "wrong_node_kind_for_op",
          name: node.op,
          message: `Op '${node.op}' requires a higher_order node`,
          source: node.source,
        });
        return errorNode(opDef.output, node.source);
      }
      const { analysedInputs, inputTypes, inputDependsOn } = validateInputs(
        node.inputs,
        opDef,
        ctx,
      );
      const evaluator = ctx.descriptor.evaluators.get(node.op);
      const output = evaluator?.inferOutput?.(inputTypes) ?? opDef.output;
      return { ...node, inputs: analysedInputs, output, dependsOn: inputDependsOn };
    }

    case "higher_order": {
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
      if (!opDef.higherOrder) {
        ctx.errors.push({
          kind: "wrong_node_kind_for_op",
          name: node.op,
          message: `Op '${node.op}' requires a standard operation node`,
          source: node.source,
        });
        return errorNode(opDef.output, node.source);
      }

      const expectedBindings = opDef.bodyBindings?.length ?? 0;
      if (node.bindings.length !== expectedBindings) {
        ctx.errors.push({
          kind: "body_binding_count_mismatch",
          name: node.op,
          message: `Op '${node.op}' expects ${expectedBindings} body binding(s) but the node provides ${node.bindings.length}`,
          source: node.source,
        });
        return errorNode(opDef.output, node.source);
      }

      const { analysedInputs, inputTypes, inputDependsOn } = validateInputs(
        node.inputs,
        opDef,
        ctx,
      );

      // Positional mapping: node.bindings[i] = user's chosen name for the i-th scoped variable.
      // opBodyBindings[i] = op's conventional name (e.g. 'item', 'acc').
      // inferBodyBindings returns op-conventional names as keys → map positionally to user names.
      // Example: user writes Filter(list, s: ...) → node.bindings = ['s'],
      //          opBodyBindings = ['item'], inferred = { item: 'Source' }
      //          → userBoundNames.set('s', 'Source')
      const opBodyBindings = opDef.bodyBindings ?? [];
      const evaluator = ctx.descriptor.evaluators.get(node.op);
      const inferredByOpName = evaluator?.inferBodyBindings?.(inputTypes) ?? {};
      const userBoundNames = new Map(ctx.boundNames);
      node.bindings.forEach((userName, i) => {
        const opName = opBodyBindings[i];
        userBoundNames.set(
          userName,
          opName !== undefined ? (inferredByOpName[opName] ?? Type.any) : Type.any,
        );
      });
      const bodyCtx = { ...ctx, boundNames: userBoundNames };

      const body = analyseNode(node.body, bodyCtx);
      const bodyOutputType = getOutputType(body);
      const output = evaluator?.inferOutput?.(inputTypes, bodyOutputType) ?? opDef.output;
      const dependsOn = union(inputDependsOn, body.dependsOn);
      return { ...node, inputs: analysedInputs, body, output, dependsOn };
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
      bindingSourceRefs.set(name, rawNode.source); // TODO: Should rete not have its node id?
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
    boundNames: new Map(),
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
        });
        // TODO: Add some sort of feedback depending on the required mode?
        if (!def.mode || def.mode === "required") okFlag = false;
      } else {
        // Unknown output + poisoned dep: warn only. Cannot affect okFlag.
        ctx.warnings.push({
          kind: "unknown_program_output",
          name,
          message: `Output '${name}' is not in the descriptor and depends on a failed binding`,
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
        });
      }
      outputMap.set(name, cnode);
    } else {
      ctx.warnings.push({
        kind: "unknown_program_output",
        name,
        message: `Output '${name}' is not declared in the descriptor`,
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
