# Architecture Overview

## Layering

```
infra/      — leaf types & semantics (no deps on the rest)
  types.ts      Type union (name | array | function) + constructors, typeToString, predicates
  nodes.ts      ASTNode / CNode, SourceRef, LiteralValue, Analysed, node constructors
  registry.ts   LanguageDescriptor, descriptor definition types, isCompatible, FnValue
  program.ts    RawProgram, CoreProgram
  ↑
parser/     — syntax (a grammar-agnostic Pratt kernel + a registered grammar)
  lexer.ts        tokenise()
  parser.ts       Parser kernel: parse(), parseExpression()
  grammar.ts      registration API: registerNud/Led/Statement, registerInfix/Prefix
  core-grammar.ts installCoreGrammar() — Dendrite's always-present syntax
  precedence.ts   the BP binding-power ladder (shared convention)
  ↑
language.ts — assembly: Language = { descriptor, grammar }; createLanguage / extendLanguage / parseSource
  ↑
stdlib/     — createStdlib(): primitive types, ops, and their operators
```

Consumers of infra (independent of the parser): `analyser/` (`analyse`), `evaluator/`
(`evaluate`, `EvalState`), `runtime/` (`run`, `createProgramRunner`, `createRuntime`).

Semantics (the descriptor: ops, evaluators, types) and syntax (the grammar: nuds/leds/operators)
are separate concerns that **meet at the AST node**. The Rete editor will read the descriptor only;
the code editor reads descriptor + grammar.

---

## Pipeline

```
source ──parseSource──▶ RawProgram ──analyse──▶ CoreProgram ──evaluate──▶ Map<string, unknown>
 (lex + parse)              │                       │
 rete graph ────────────────┘ (future adapter)      └ every node carries dependsOn
```

- **RawProgram** (`ASTNode`) — unvalidated, no analysis metadata. From `parseSource` (code) or a
  future rete adapter. Equivalent to ExprExt (CPL).
- **CoreProgram** (`CNode`) — validated; every node has `dependsOn: ReadonlySet<string>`. Equivalent
  to ExprC (CPL).
- Store RawProgram, never CoreProgram — CoreProgram is re-derived on load, so a descriptor change
  surfaces analysis errors instead of going silently stale.

**Key invariant:** `CRefNode.dependsOn === program.bindings.get(name).dependsOn` — set by the
analyser, relied on by the evaluator for cache invalidation without binding lookups.

---

## Type system

Structured `Type` union (`infra/types.ts`), not strings:

```ts
type Type =
  | { kind: "name"; name: string }                                  // number, boolean, any, null, Source…
  | { kind: "array"; element: Type }                                // T[]
  | { kind: "function"; params: Type[]; returns: Type; paramNames? } // (A, B) -> C
```

- **Only named types are registered** (`descriptor.types`). Arrays and functions are **structural**
  — built with `Type.array(...)` / `Type.fn(...)`; there is no auto-`T[]` registration.
- `isCompatible(actual, expected, descriptor)` (registry.ts) — always call it, never inline:
  - `expected` is `any` → any **data** value (not a function); `actual` is `any`/`null` → usable
    where any data value is expected (not a function). The **functions-⊄-`any`** guard is the totality
    safeguard (blocks laundering a function through `any`).
  - arrays: covariant (`T[]` ⊆ `S[]` iff `T` ⊆ `S`).
  - functions: same arity, **contravariant params, covariant return**.
  - names: exact, or walk `TypeDefinition.extends` upward (subtyping — implemented).
- Element-type inference: an array literal infers a homogeneous element type (`[1,2,3]` → `number[]`,
  mixed/empty → `any[]`). Generic ops thread element types via `inferInputTypes`/`inferOutput`.

---

## First-class functions

`lambda` and `app` are core AST node kinds (semantics hardcoded in the analyser/evaluator switches;
the *grammar* is registered like everything else).

- **Lambda** → `Type.fn(paramTypes, bodyReturn)`. Untyped params default to `any` (gradual typing);
  an optional `returnType` annotation is checked against the inferred body type.
- **Application** (`callee(args)`) — `resolveAppArgs` maps positional + named args to params; the
  callee must be function-typed; output is the function's `returns`.
- **Higher-order ops are ordinary ops with a function-typed input** (no `HigherOrderNode`). e.g.
  `Filter(list, predicate: (E) -> boolean) -> E[]`. The element type `E` is refined from the resolved
  `list` via the evaluator's `inferInputTypes`; the function input is declared last so its
  dependencies resolve first. Inline lambda params are contextually typed from the expected function
  type.
- **Closures** are real and lexical: a lambda captures the current `localBindings` (params + future
  locals); globals are a separate always-present base. Nesting/currying work. Recursion stays blocked
  (a self-reference is a `binding_cycle`; self-application is untypable + functions-⊄-`any`), so v1 is
  strongly normalising.

---

## Pull-based evaluation

The evaluator pulls results from outputs. `changedInputs: Set<string>` flows through a traversal;
each node checks `dependsOn ∩ changedInputs`:

```
nodeCache.has(node) AND changedInputs ∩ dependsOn = ∅  →  return cached
otherwise                                              →  recompute + cache
```

`isCached()` iterates `changedInputs` (typically 1–3) not `dependsOn`. A single `EvalContext` bundles
the traversal invariants (`program`, `descriptor`, `changedInputs`); the recursion
threads only `(node, ctx, state)`. The shared `memoise()` helper applies the cache dance for inline
nodes.

### Cache layers (`EvalState`)

| Cache | Key | Scope | Used for |
|---|---|---|---|
| `inputs` | string (name) | Program | Host-set context inputs and triggers |
| `nodeCache` | WeakMap (object) | Program | Named bindings + top-level inline nodes |
| `bodyScope` | WeakMap (object) | Per closure application | Inline nodes inside a lambda body |
| `localBindings` | string (name) | Per scope | Lambda params (local-first lookup; shadow globals) |

`bodyScope` is fresh per application because params aren't in `dependsOn` — the normal cache check
can't see them change between iterations. Closures are not cached (they capture `changedInputs`).

---

## Host integration — inputs-only

Ops are **pure functions of their declared inputs**; there is no `hostContext` side-channel. The host
projects its world (e.g. an ATEM connection's source/tally state) into typed **context inputs** and
`updateInput`s them on change. An evaluator reads host data only through op inputs the program wired a
context input into — so every dependency is visible in the AST, captured in `dependsOn`, and correctly
re-evaluated. (A hidden channel — `hostContext` or letting an evaluator peek at `state.inputs` — would
be invisible to `dependsOn` and cache stale; rejected for exactly that reason. Dendrite is
side-effect-free, so there's no effect-capability left for such a channel to carry.)

---

## Error handling

- **ParseError / ParseWarning** (`parser/types.ts`) — lexer + parser never throw; they accumulate and
  recover. Kinds incl. `syntax_error`, `unexpected_token`, `unterminated_string`, `unknown_character`.
- **AnalysisError / AnalysisWarning** (`analyser/types.ts`) — e.g. `unknown_op`,
  `unknown_program_input`, `binding_cycle`, `op_input_type_mismatch`, `program_output_type_mismatch`,
  `app_argument_mismatch`, `forward_reference`; warnings `unused_binding`, `implicit_any_cast`,
  `missing_op_input`, … Errors collect (no fail-fast); `failedBindings` suppresses cascades.
- **EvalError** (`evaluator/types.ts`) — `evaluator_not_found`, `undefined_reference`, `input_not_set`,
  `invalid_field_access`, `host_error`, `not_a_function`, `error_node_reached`. The runtime wraps
  per-program evaluation and routes `EvalError`s to `onError`; unexpected throws propagate.

---

## Execution levels (`runtime/`)

| | `run()` | `createProgramRunner()` | `createRuntime()` |
|---|---|---|---|
| State | None | Single program | Multi-program |
| Caching | No | Yes | Yes |
| Subscriptions | No | No | Yes (`ProgramHandle`) |

All accept a `CoreProgram`. `register()` returns a `ProgramHandle` with `onOutput`, `onError`,
`unregister`. The runtime indexes programs by input name so only affected programs re-evaluate.

---

## Planned (not yet built)

- **`serialise.ts`** — `SavedProgram` ↔ `RawProgram` (Maps → records, strip `source`). Needed before
  persistence.
- **`environment.ts`** — wrapper holding the `descriptor` (and, later, a shared prelude), exposing
  `analyse`, `load` (deserialise + analyse), `run`, `createRunner`, `runtime`, and a `compile`
  (parse + analyse) on top of `parseSource`.
- **Rete adapter** (`@dendrite-lang/editor`) — rete graph ↔ RawProgram, `SourceRef { kind: 'rete',
  nodeId }`, no lexical-order enforcement (no line numbers).
