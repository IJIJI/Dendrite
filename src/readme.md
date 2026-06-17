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