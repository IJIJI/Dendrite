# Beacon Extension Reference

Content in this file belongs to `@dendrite-lang/beacon`, a separate (planned) package that extends `@dendrite-lang/core`. It lives here for historical context from the initial design session. Types are shown in shorthand (`Source[]`, `TallyState`) for readability, but are built with the structured `Type` constructors (`Type.array(Type.name('Source'))`, `Type.name('TallyState')`).

---

## Beacon language ops

### ATEM source ops
| Op | Inputs | Output | Notes |
|---|---|---|---|
| `BusSources` | `busId: string` | `Source[]` | Gets sources on a bus from hostContext |
| `BusProgram` | `bus: SourceBus` | `Source` | Program source of a bus |
| `BusPreview` | `bus: SourceBus` | `Source` | Preview source of a bus |
| `ListIncludes` | `list: Source[], sourceId: string` | `boolean` | Source ID membership check |

### Tally ops
| Op | Inputs | Output | Notes |
|---|---|---|---|
| `TallyCheck` | `source: Source` | `TallyState` | Gets tally from hostContext |
| `IsProgram` | `state: TallyState` | `boolean` | |
| `IsPreview` | `state: TallyState` | `boolean` | |
| `IsIdle` | `state: TallyState` | `boolean` | |
| `TallyStatePriority` | `priority: TallyState[], nodes: TallyState` (variadic) | `TallyState` | Returns highest-priority active state |
| `TallyStateMap` | `states: TallyState` (variadic), `conditions: boolean` (variadic) | `TallyState` | Parallel arrays — must have equal length |

---

## Beacon context inputs

| Name | Type | Trigger | Default |
|---|---|---|---|
| `sourceBusNew` | `SourceBus` | — | — |
| `sourceBusOld` | `SourceBus` | — | — |
| `fallbackState` | `FallbackState` | — | `'disconnected'` |
| `alertMessage` | `AlertMessage` | yes | `null` |

---

## Beacon outputs

| Name | Type | Mode |
|---|---|---|
| `tally` | `TallyState` | required |
| `preview` | `TallyState` | desired |
| `text` | `string` | optional |

---

## Beacon types and defaults

| Type | Default | Notes |
|---|---|---|
| `TallyState` | `'idle'` | `'program' \| 'preview' \| 'idle'` |
| `Source` | `null` | `{ id: string, name: string }` |
| `SourceBus` | `null` | `{ me, program, preview }` |
| `FallbackState` | `'disconnected'` | `'connected' \| 'disconnected' \| 'reconnecting'` |
| `AlertMessage` | `null` | `{ level, message, source }` |

---

## Beacon-specific design decisions

**No SourceList alias — arrays are structural.**
`SourceList` was a manually-registered alias for `z.array(SourceSchema)`. Arrays are now structural: only the named `Source` type is registered, and array-ness is expressed at the use site (`Type.array(Type.name('Source'))`) — no separate registration, no auto-generated `'Source[]'`.

**TallyState default: 'idle'.**
Safest fallback for a live broadcast context. Camera is assumed idle if tally state is unknown.

**FallbackState default: 'disconnected'.**
Conservative default — assume disconnected rather than falsely reporting connected.

**Output type mismatch for required outputs is an error.**
For tally (required), producing the wrong type is a real mistake. For desired/optional outputs, type mismatch is a warning.
