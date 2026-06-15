# Ops Reference

Complete list of registered ops in `@dendrite-lang/core`. For Beacon-specific ops, types, and context inputs see `.claude/beacon-reference.md`.

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
| `If` | `condition: boolean, then: any, else: any` | `any` | Branch type if both match |
| `IsSet` | `value: any` | `boolean` | — (always boolean) |
| `Default` | `value: any, fallback: any` | `any` | Value's type when known |

`If` evaluates both branches eagerly (not short-circuit). If the inactive branch throws, If fails. This is a known limitation — short-circuit would require a `lazy` OpInput flag (future work).

### List (higher-order)
| Op | Inputs | Output | `bodyBindings` | inferOutput |
|---|---|---|---|---|
| `Filter` | `list: any` | `any[]` | `['item']` | Passthrough element type |
| `Map`    | `list: any` | `any[]` | `['item']` | `bodyOutputType[]` |
| `Find`   | `list: any` | `any`   | `['item']` | Element type (not array) |
| `Every`  | `list: any` | `boolean` | `['item']` | — |
| `Some`   | `list: any` | `boolean` | `['item']` | — |
| `Reduce` | `list: any, initial: any` | `any` | `['acc', 'item']` | Initial value type |

`Find` returns the found element or `null` (not an empty array). Handle null via `IsSet`/`Default`.

---

## Core types and defaults

| Type | Default | Notes |
|---|---|---|
| `boolean` | `false` | |
| `number` | `0` | |
| `string` | `''` | |
| `any` | `null` | |
| `T[]` | `[]` | Auto for all array types |

