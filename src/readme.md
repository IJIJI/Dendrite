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

- [ ] Type extending
- [ ] Auto type conversion. e.g. a numeric input into a boolean is true when not null?
- [ ] Coercion operations. E.g. toBoolean(value) -> Converts e.g. a non 0 number to true, 0 to false.
- [ ] Field typing (for structs)
- [ ] Subtyping
- [ ] Output dependance. If one of a group fails analysis, then drop all of said group. Maybe directional.
- [ ] More levels of stdlinb? E.g. empty, skeleton, base, core and extended? Probably core as the top level default.
  - [ ] Make it easier to configure a language.
- [ ] Make sure stdlib is named correctly everywhere, core is still used in some places.
- [ ] Add an operator to combine arrays
- [ ] Add more operators in general
- [ ] Remove normal and higher order node distinction?
      -> Add a ArrowFunctionNode or ClosureNode, then take that as input?
      -> Would mean higher order nodes can just be normal operations?
      -> Would also mean operations should have the same extra functions higher order nodes do.
      -> But, whould that mean that a user can define functions? Is that desirable? Do both or only allow as inputs?
- [ ] Add Lambda / arow functions
      -> Add LambdaNode/closure
      -> Add CallNode/Application
- [ ] Add some helper to convert noderef to loggable? Like in example 3-(code)/1-lexer.ts
- [ ] Add code to manage analysis + run / runner / runtime
- [ ] Also add code to manage editor(code/rete) parsing
      -> Combine with analysis+running? -> Probably not, seperate things
- [ ] Also add code to manage displaying editors
      -> Combine with parsing?
- [ ] Add some sort of validation of the registry?
- [ ] Move tests to a seperate folder (structure)? It adds a lot of clutter now.
- [ ] Decide between .den, .dndr, .dnr or something else.
- [ ] Currently null is castable to any type. This means nullability. Do we want that?
  - [ ] If not, do we at some point want to allow multiple types in operations and lambdas/ nodes?
- [ ] Look deeper at lambda name shadowing. When a multiline lambda that has a binding, calls a lambda that rebinds that name, it might cause issues.
      -> Better name shadowing.
- [ ] Work on lambda depends on and caching efficiency. How much does really need to be recomputed?
- [ ] It would be really nice to be able to do definable generic type extensions. For example the higher order node could have for both the array input as the function input a generic type T extends any, but in this way they always match.
- [ ] Move lambda functions into stdblib to keep core slim. Only bindings and outputs.
- [ ] Also, core language might be better named kernel, if it is not all moved out to a subset of stdlib.
