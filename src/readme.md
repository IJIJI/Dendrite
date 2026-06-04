```
Source / Graph
    ↓  parse          → ParseResult<RawProgram>
RawProgram
    ↓  analyse        → AnalysisResult<CoreProgram>
CoreProgram
    ↓  evaluateProgram  (calls evaluate per dirty node)
Value Map
```


Partial recomputation!
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
