/**
 * Stage 2: Parser. Lex + parse grade.den into a RawProgram and print the AST
 * back as readable source.
 *
 * The parser is descriptor-driven: it needs the language to resolve op calls
 * (positional → named input mapping) and to know which $names are real inputs.
 * In this example the stdlib is used.
 */

import { readFileSync } from "fs";
import { tokenise } from "../../src/language/parser/lexer";
import { parse } from "../../src/language/parser/parser";
import { createStdlib } from "../../src/language/stdlib";
import type { ASTNode, SourceRef } from "../../src/language/infra/nodes";
import { Type } from "../../src/language/infra/types";

// Format a source ref as line:column (or the rete node id), "?" when absent.
const loc = (s?: SourceRef): string =>
  s ? (s.kind === "code" ? `${s.line}:${s.column}` : s.nodeId) : "?";

// --- Language ---------------------------------------------------------------
const lang = createStdlib();
lang.registerInput({ name: "score", type: Type.number });
lang.registerInput({ name: "bonus", type: Type.number });

// --- Lex + parse ------------------------------------------------------------
const source = readFileSync(new URL("./grade.den", import.meta.url), "utf8");
const { tokens, errors: lexErrors, warnings: lexWarnings } = tokenise(source, [
  ...lang.grammar.operatorTokens,
]);
const result = parse(tokens, lang.descriptor, lang.grammar);

// --- Render an ASTNode back to readable, source-like text -------------------
function show(node: ASTNode): string {
  switch (node.kind) {
    case "literal":
      return JSON.stringify(node.value);
    case "ref":
      return node.name;
    case "input":
      return `$${node.name}`;
    case "array":
      return `[${node.items.map(show).join(", ")}]`;
    case "field":
      return `${show(node.struct)}.${node.field}`;
    case "operation":
      return `${node.op}(${Object.entries(node.inputs)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.map(show).join(", ")}]` : show(v)}`)
        .join(", ")})`;
    default:
      return node.kind;
  }
}

// --- Report -----------------------------------------------------------------
if (!result.ok) {
  console.log("=== Parse failed ===");
  for (const e of [...lexErrors, ...result.errors])
    console.log(`  ${e.kind} @ ${loc(e.source)}: ${e.message}`);
} else {
  console.log("=== Bindings ===");
  for (const [name, node] of result.program.bindings) console.log(`  let ${name} = ${show(node)}`);
  console.log("\n=== Outputs ===");
  for (const [name, node] of result.program.outputs)
    console.log(`  output ${name} = ${show(node)}`);
  if (lexWarnings.length + result.warnings.length > 0) {
    console.log("\n=== Warnings ===");
    for (const w of [...lexWarnings, ...result.warnings])
      console.log(`  ${w.kind} @ ${loc(w.source)}: ${w.message}`);
  }
}
