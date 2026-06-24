# Dendrite Language

A declarative dataflow language. Programs declare named bindings and outputs; when context inputs change, only affected nodes recompute.

## Pipeline

```
SavedProgram → deserialise → RawProgram → analyse → CoreProgram → evaluate → Map<string, unknown>
```

- **RawProgram** - unvalidated AST from the parser or rete adapter (`ASTNode`)
- **CoreProgram** - validated, every node has `dependsOn: ReadonlySet<string>` (`CNode`)
- Store RawProgram; CoreProgram is always re-derived on load

## Pull-based evaluation

Each `CNode` carries `dependsOn` - the set of context input names it transitively depends on. On each cycle `evaluateProgram` receives `changedInputs: Set<string>`. A node recomputes only when `changedInputs ∩ dependsOn` is non-empty and no cache entry exists.

Caching uses two WeakMaps keyed on CNode object identity:

- `nodeCache` - shared across the program, used for named bindings and top-level inline nodes
- `bodyScope` - fresh per closure application (a lambda body), prevents stale values when a param (`item`, `acc`) changes between iterations

## Execution levels

|               | `run()` | `createProgramRunner()` | `createRuntime()`   |
| ------------- | ------- | ----------------------- | ------------------- |
| State         | None    | Single program          | Multi-program       |
| Caching       | No      | Yes                     | Yes                 |
| Subscriptions | No      | No                      | Yes (ProgramHandle) |

## File layout

Layering DAG: **infra ← parser ← language.ts ← stdlib**; analyser / evaluator / runtime
consume infra. Semantics (descriptor) and syntax (grammar) meet at the AST node.

```
src/language/
  infra/
    nodes.ts        - ASTNode, CNode, SourceRef, node constructors (operationNode)
    types.ts        - structured Type union + constructors, typeToString, type predicates
    registry.ts     - LanguageDescriptor, descriptor types, isCompatible, FnValue
    program.ts      - RawProgram, CoreProgram
  parser/
    lexer.ts        - tokenise()
    parser.ts       - grammar-agnostic Pratt kernel (Parser, parse, parseExpression)
    grammar.ts      - registration API (registerNud/Led/Statement, registerInfix/Prefix)
    core-grammar.ts - Dendrite's core grammar (installCoreGrammar)
    precedence.ts   - the BP binding-power ladder (shared convention)
    types.ts        - parse error / warning / result types
  analyser/
    analyser.ts     - analyse() : RawProgram → CoreProgram (passes: ref graph, topo sort,
                      bindings, outputs, prune, unused)
    types.ts        - AnalysisError / Warning / Result, AnalysisContext
  evaluator/
    evaluator.ts    - evaluate, evaluateProgram, EvalContext, memoise
    types.ts        - EvalState, EvalError
  runtime/
    runner.ts       - run(), createProgramRunner()
    runtime.ts      - createRuntime(), ProgramHandle
  stdlib/
    index.ts        - createStdlib() (types + logic/comparison/control/arithmetic/list ops
                      and their operators)
  language.ts       - Language assembly: createLanguage / extendLanguage / parseSource
```

# TODO

Deferred *design* work (with full rationale) lives in [`.docs/todo.md`](../../.docs/todo.md) — e.g.
explicit conversion ops, struct field typing, union types / strict nullability, generic type
parameters, array element-type generics, `letrec`/recursion, multiline lambda bodies, the open-AST
node-kind registry, and true source-span ranges.

Repo-level / near-term:
- [ ] More stdlib levels (empty / skeleton / base / core / extended); make configuring a language easier.
- [ ] More operators (e.g. array concatenation) and math ops (min, max, average).
- [ ] Coercion operations. E.g. toBoolean(value) -> Converts e.g. a non 0 number to true, 0 to false.
- [ ] Field typing (for structs)
- [ ] Output dependance. If a binding fails analysis, don't drop the entire program, just the outputs that are affected.
- [ ] Add more helpers to log results, like in the code example.
- [ ] Entry-point glue: manage analyse + run/runner/runtime, and editor (code/rete) parsing + display.
- [ ] Registry validation.
- [ ] Move tests into a separate folder (reduce clutter).
- [ ] Enable optional arguments. 
  - [ ] Make it possible to make arguments have a default for if they are unset.
- [ ] Decide the file extension (`.den`, `.dndr`, `.dnr`, …).
- [ ] Consider renaming the empty `createLanguage` base to "kernel" (vs the `stdlib` batteries-included).
