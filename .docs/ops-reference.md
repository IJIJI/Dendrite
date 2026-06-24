# Ops Reference

Registered ops, operators, and types in `@dendrite-lang/core` (`createStdlib()`). For Beacon-specific
ops/types/inputs see [`beacon-reference.md`](beacon-reference.md).

---

## Core language ops

### Logic
| Op | Inputs | Output | Notes |
|---|---|---|---|
| `And` | `nodes: boolean` (variadic) | `boolean` | All must be true |
| `Or`  | `nodes: boolean` (variadic) | `boolean` | Any must be true |
| `Not` | `a: boolean` | `boolean` | |
| `Xor` | `nodes: boolean` (variadic) | `boolean` | Odd number true |

### Comparison
| Op | Inputs | Output |
|---|---|---|
| `Equals` | `a: any, b: any` | `boolean` |
| `NotEquals` | `a: any, b: any` | `boolean` |
| `GreaterThan` | `a: number, b: number` | `boolean` |
| `LessThan` | `a: number, b: number` | `boolean` |

### Control flow
| Op | Inputs | Output | inferOutput |
|---|---|---|---|
| `If` | `condition: boolean, then: any, else: any` | `any` | Branch type when both match |
| `IsSet` | `value: any` | `boolean` | — (always boolean) |
| `Default` | `value: any, fallback: any` | `any` | Value's type when known, else fallback's |

`If` evaluates both branches eagerly (not short-circuit). If the inactive branch throws, `If` fails.
Short-circuit would need a `lazy` OpInput flag (future work).

### Arithmetic
| Op | Inputs | Output |
|---|---|---|
| `Add` | `nodes: number` (variadic) | `number` |
| `Subtract` | `a: number, b: number` | `number` |
| `Multiply` | `nodes: number` (variadic) | `number` |
| `Divide` | `a: number, b: number` | `number` (÷0 → 0) |
| `Length` | `list: any` | `number` |

### List (higher-order)
These are **ordinary ops with a function-typed input** (no special node kind). The function's
element-type params are refined from the resolved `list` via `inferInputTypes`; an inline lambda's
untyped params are contextually typed from that.

| Op | Inputs | Output |
|---|---|---|
| `Filter` | `list: E[], predicate: (E) -> boolean` | `E[]` |
| `Map` | `list: E[], transform: (E) -> R` | `R[]` |
| `Find` | `list: E[], predicate: (E) -> boolean` | `E` (or `null` if none) |
| `Every` | `list: E[], predicate: (E) -> boolean` | `boolean` |
| `Some` | `list: E[], predicate: (E) -> boolean` | `boolean` |
| `Reduce` | `list: E[], initial: Acc, reducer: (Acc, E) -> Acc` | `Acc` |

`Find` returns the found element or `null` — handle null via `IsSet` / `Default`.

---

## Operators

Surface sugar registered next to the ops; they desugar to op nodes (no new ops). The lexer's operator
vocabulary is single-sourced from the grammar. Core arrows `=>` (lambda) and `->` (function type) are
always recognised.

| Operator | Desugars to | Tier |
|---|---|---|
| `\|\|` | `Or` | OR |
| `&&` | `And` | AND |
| `==` / `!=` | `Equals` / `NotEquals` | EQUALITY |
| `<` / `>` | `LessThan` / `GreaterThan` | COMPARE |
| `>=` / `<=` | `Not(LessThan)` / `Not(GreaterThan)` | COMPARE |
| `+` / `-` | `Add` / `Subtract` | ADD |
| `*` / `/` | `Multiply` / `Divide` | MULTIPLY |
| `!` (prefix) | `Not` | PREFIX |

Chains nest by binding power (`a + b + c` → `Add(Add(a, b), c)`). See `parser/precedence.ts`.

---

## Core types and defaults

Only **named** types are registered; arrays (`Type.array`) and functions (`Type.fn`) are structural
(no registration, no auto-`T[]`).

| Type | Default | Notes |
|---|---|---|
| `boolean` | `false` | |
| `number` | `0` | |
| `string` | `''` | |
| `any` | `null` | |

Array literals infer a homogeneous element type (`[1, 2, 3]` → `number[]`, mixed/empty → `any[]`).
