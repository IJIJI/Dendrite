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
- `bodyScope` - fresh per `apply()` call inside a higher-order body, prevents stale values when the scoped variable (`item`, `acc`) changes between iterations

## Execution levels

|               | `run()` | `createProgramRunner()` | `createRuntime()`   |
| ------------- | ------- | ----------------------- | ------------------- |
| State         | None    | Single program          | Multi-program       |
| Caching       | No      | Yes                     | Yes                 |
| Subscriptions | No      | No                      | Yes (ProgramHandle) |

## File layout

```
src/language/
  nodes.ts     - ASTNode, CNode, SourceRef
  registry.ts  - LanguageDescriptor, registration API, isCompatible
  program.ts   - EvalState, evaluate, evaluateProgram, EvalError
  runner.ts    - run(), createProgramRunner()
  runtime.ts   - createRuntime(), ProgramHandle
  core.ts      - createCoreLanguage() (logic, comparison, control, list ops)
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
