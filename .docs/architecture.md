# Architecture Overview

## Layering

```
infra/      — leaf types & semantics (no deps on the rest)
  types.ts      Type union (name | array | function) + constructors, typeToString, predicates
  nodes.ts      ASTNode / CNode, SourceRef, LiteralValue, Analysed, node constructors
  registry.ts   Vocabulary + LanguageDescriptor, definition types, isCompatible, FnValue
  ports.ts      Ports, PortLayer, Policy, flattenPorts, isPorts
  identifier.ts the one identifier rule, shared by the lexer and port names
  observable.ts Observable / Subject / createSubject — the reactive primitive
  program.ts    RawProgram, CoreProgram
  serialise.ts  SavedProgram (+ the ports it declares), serialise / deserialise / migrate
  ↑
parser/     — syntax (a grammar-agnostic Pratt kernel + a registered grammar)
  lexer.ts        tokenise()
  parser.ts       Parser kernel: parse(), parseExpression()
  grammar.ts      registration API: registerNud/Led/Statement, registerInfix/Prefix
  core-grammar.ts installCoreGrammar() — Dendrite's always-present syntax
  precedence.ts   the BP binding-power ladder (shared convention)
  ↑
language.ts — assembly: Language = { descriptor: Vocabulary, grammar }; createLanguage /
              extendLanguage / parseSource
  ↑
compose.ts  — composeLayers(vocabulary, global, program) → the LanguageDescriptor a program is
              analysed and evaluated against, plus provenance; or the problems, each blamed
              on the layer that caused it
  ↑
stdlib/     — createStdlib(): primitive types, ops, and their operators
```

Consumers of infra (independent of the parser): `analyser/` (`analyse`), `evaluator/`
(`evaluate`, `EvalState`), `runtime/` (`run`, `createProgramRunner`, `createRuntime`,
`createInstance`).

Above core, two more workspace packages, each depending on core only:

```
packages/link/   — @dendrite-lang/link: a ProgramInstance across a channel. serveInstance (the
                   host's end), connectInstance (a replica that IS a ProgramInstance), the wire
                   as data, Channel adapters (MessagePort, WebSocket). See "Linking" below.
packages/editor/ — @dendrite-lang/editor: the code editor over a Connection (own stack, a host's
                   runtime, or an attached instance - local or a link replica); React under /react.
```

**A language is vocabulary only.** `Vocabulary` is types, ops and evaluators — the words programs
are written in. What a program reads and produces arrives as **port layers** that compose on top,
producing a `LanguageDescriptor`. Only `composeLayers` produces one, which is what stops a
program being analysed against a language that declares nothing: with no declarations every
output would be dropped as unknown, silently.

Layers stack in order and an earlier one owns a contested name, so a problem is always reported
against the LATER layer. They hang at one of two **levels**: global (the runtime, one value for
every program) or program (one instance, values per program).

Semantics (the descriptor: ops, evaluators, types) and syntax (the grammar: nuds/leds/operators)
are separate concerns that **meet at the AST node**. The Rete editor will read the descriptor only;
the code editor reads descriptor + grammar. The parser reads neither ports nor declarations:
`$x` is an input because of the sigil, and the analyser types it from the composed descriptor.

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

## Host integration — inputs-only, declared in layers

Ops are **pure functions of their declared inputs**; there is no `hostContext` side-channel. The host
projects its world (e.g. an ATEM connection's source/tally state) into typed **context inputs** and
`updateInput`s them on change.

A host declares those inputs as a **port layer** rather than on the language: `Policy.host` marks a
layer it feeds and the user may not edit, `Policy.user` the document's own, which is editable and
saved. Layers at the **global** level hang on the runtime (one value for every program); layers at
the **program** level belong to one instance. A capability the host feeds to one program alone is
just a `Policy.host` layer at program level, named after the capability. An evaluator reads host data only through op inputs the program wired a
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

| | `run()` | `createProgramRunner()` | `createRuntime()` | `createInstance()` |
|---|---|---|---|---|
| State | None | Single program | Multi-program | One deployed program |
| Caching | No | Yes | Yes | Yes (via the runtime) |
| Subscriptions | No | No | Yes (`ProgramHandle`) | Five observables |
| Owns | — | — | global layers, global values | its program layers, values, diagnostics, snapshot |

The first three accept a `CoreProgram`. `register()` returns a `ProgramHandle` with `onOutput`,
`onError`, `setInput`, `fireTrigger` and `unregister`. The runtime indexes programs by GLOBAL input
name, so only affected programs re-evaluate and a program-level name never fans out.

`createInstance()` takes a `SavedProgram` instead, and is the front door for a host: it composes
its layers, compiles, registers, recompiles when the global layers move under it, and publishes
`diagnostics`, `ports`, `outputs`, `values` and `snapshot`. Internally the runtime keeps one
`ProgramEntry` per registration (`runtime/entry.ts`), which owns that program's evaluation state —
and therefore its node cache — while the runtime keeps the registry, the index and the global
values. Seeding goes through one rule for every level (`runtime/seed.ts`).

When a program stops compiling the runtime keeps running the last good one, and everything it
produces is published `stale: true` rather than hidden — what the lights follow is what the UI
shows, marked.

Every instance command returns nothing and reports through the observables. A refused layer
change is published as `ports` diagnostics marked `refused` — nothing moved — rather than
returned, because a synchronous answer cannot cross a wire, and the editor drives instances
across one (below).

---

## Linking an editor to a core it does not own (`packages/link`)

The editor depends on exactly one object, a `ProgramInstance`, plus a `Language` to highlight
with. A `Connection` (`packages/editor/src/connection.ts`) is where those come from: `ownStack`
(a private stack — the playground), `joinRuntime` (the editor's own instance on a runtime the
host runs, seeing its live global values), or `attach` (a program the host already runs). The
last one is how a **remote** core is reached: `connectInstance` returns a replica that
implements `ProgramInstance`, and the editor cannot tell it from a local one.

**The wire is data.** Commands (`setInput`, `fireTrigger`, `setProgram`, `setLayer`) go client
→ server, sequence-numbered and fire-and-forget. Pushes come back, one per observable, each
stamped with the last command the server had seen on that channel; `hello` is answered with all
five at once, so a replica never renders empty. Dendrite owns the shapes and both ends; the host
owns the pipe by implementing `Channel { send, onMessage, status? }` over whatever it already
has, or takes an adapter.

**What the replica does to feel local:** it recomposes `ports` from the layers with its own
language (a composed descriptor holds functions and cannot cross — hence `hello` carries a
protocol version and a vocabulary fingerprint, and a mismatch is refused with the difference
named); it echoes `setInput` into `values` at once, and into `snapshot` for the persisted
layer's inputs; it drops a `values` push stamped before its latest command and adopts the clock
of a `state` push; it marks outputs `stale` when the channel drops and re-handshakes when it
returns; it refuses locally what a local instance refuses.

**The server is the trust boundary.** Core trusts its caller on purpose (`Policy` is data); a
client is not the host. `serveInstance` enforces each layer's policy — no editing a layer that
is not `editable`, no feeding an input a `feeds: "host"` layer owns — strips zod schemas, which
cross no wire, and drops what is malformed or what core throws on, reporting each. Who the
client is, which program it opens, and revisions are the host's, at its own API.

Not yet: analysing locally (diagnostics mirror the server's, one round trip of latency) and
detecting two writers (the envelope's `revision` field exists for it; version history is where
detection lands). `packages/link/README.md` has the protocol table.

---

## Persistence (`infra/serialise.ts` + `environment.load`)

**The authoring artifact is canonical; the RawProgram is derived** — an AST loses comments,
formatting, and the operator surface (desugaring is destructive). So `SavedProgram` is a tagged
union of authoring forms: `code` (source text, re-parsed on load) | `rete` (opaque graph blob,
reserved — schema + loader arrive with the editor package) | `ast` (plain-record RawProgram, for
programmatic/headless use; SourceRefs kept verbatim). `env.load(saved)` dispatches on form and
always **re-analyses** against the load-time descriptor, so drift surfaces as errors.

A saved program also carries the ports it declares for itself (`SavedProgram.ports`), so a document
travels with its own inputs and outputs. That plus the values of those inputs is core's `Snapshot`,
the memento a host stores; a host's own envelope (ids, names, timestamps, revisions) wraps it.
`LoadResult` = `CompileResult` + a `stage: "load"` arm (`unsupported_form` / `unsupported_version`
/ `malformed_program`). Core owns the format `version` (+ `migrate()` seam); hosts wrap their own
envelope (ids, names, timestamps).

---

## Planned (not yet built)

- **Rete adapter** (`@dendrite-lang/editor`) — rete graph ↔ RawProgram, `SourceRef { kind: 'rete',
  nodeId }`, no lexical-order enforcement (no line numbers). Also supplies the loader for
  `SavedProgram`'s reserved `rete` form.
