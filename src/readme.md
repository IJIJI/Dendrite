```
Source / Graph
    ↓  parse                    → ParseResult<RawProgram>
RawProgram
    ↓  analyse                  → AnalysisResult<CoreProgram>
CoreProgram
    ↓  evaluateProgram          → Map<string, unknown> ∨ EvalError(kind: EvalErrorKind, message: string)
Output: Map<string, unknown>    → When using the runtime respective listeners are triggered.
```

Partial recomputation!
TODO: Now is a per node dependency, works faster. Rewrite doc.

```
updateInput('sourceBusNew', value, state, program)
  → markDirty('sourceBusNew')           // uses dependents to propagate
    → markDirty('sourcelist')
      → markDirty('s2')
      → markDirty('s3')
        → markDirty('combined')
          → markDirty('result')

evaluateProgram(program, state, ...)
  → walks evalOrder: ['sourcelist', 's2', 's3', 'combined', 'result']
    → skips clean nodes                 // uses dirty set
    → calls evaluate only on dirty ones
```
