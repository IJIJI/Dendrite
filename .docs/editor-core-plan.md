# The editor as a control surface over core — plan

> **Status: S1 and S4 landed 2026-09-08; S2 and S3 remain, at the end of the backlog.** Written
> 2026-09-07/08 from the discussion that followed the ports refactor. Three things differ from
> the sketch below: the host passes a **`Language`, not an environment** (the editor builds its
> own — `createEnvironment` is pure over a language); the editor's config is a **`Connection`**
> object (`ownStack` / `joinRuntime` / `attach`) rather than a union; and **the transport was
> built before a real API existed**, because its shape is fixed by `ProgramInstance`, not by
> Beacon: `@dendrite-lang/link` (`serveInstance` / `connectInstance`, a `Channel` the host
> implements over its own pipe, MessagePort and WebSocket adapters). S4's
> `createRemoteInstance` sketch is `connectInstance`; the `setLayer` change landed first, as its
> own commit. Apply stays the host's (`live.setProgram(editor.getDocument().program)`), so the
> link never needs a "draft" — it serves whichever instance the server chooses. The envelope's
> `revision` field is decided (optional, no bump). `.docs/todo.md` carries the short version.

## Context

`createEditor` builds its own environment, runtime and instance, and disposes all of it. That is
right for the playground, where the editor IS the application, and wrong for every other host.

Beacon is the case that matters. Core runs the lights whether or not anyone has an editor open.
The editor is a peripheral that attaches to a program already running, edits it, and detaches.
Mounting it as things stand would create a second runtime: no global values, not driving
anything, and edits that never reach the live program.

The runtime should also be able to live somewhere else entirely. In the playground it is in the
browser; for Beacon it may be behind an API, with the browser holding only a view of it.

## The shape

```
                    ┌──────────────────────────────────┐
  the editor  ────► │ ProgramInstance                  │  five observables, four commands
                    │  diagnostics ports outputs       │
                    │  values snapshot                 │
                    └───────────────┬──────────────────┘
                                    │
                    ┌───────────────┴──────────────────┐
                    │ Runtime: global layers + values  │
                    └───────────────┬──────────────────┘
                                    │
              in-process (playground)│  or  a duplex channel (Beacon)
                                    │           │
                                    ▼           ▼
                              the same object   a client-side replica
```

The editor depends on exactly one thing, `ProgramInstance`, plus the `Language` for
highlighting. That is what makes the remote case tractable: a client-side object implementing
the same interface is indistinguishable from a local one.

## Decisions

| Point | Decision | Why |
|---|---|---|
| Who owns the runtime | The host, when there is one. `EditorConfig` becomes a union: own the stack as today, or take an existing runtime (and optionally an instance) plus the language it was built from | An editor that builds its own cannot attach to a program that is already running |
| Disposal | `dispose` unregisters only what the editor created | A borrowed instance outlives the editor |
| Live edits | The editor edits a SECOND instance on the SAME runtime: same layers, different id | It sees the same live global values, and a half-finished edit never drives the lights. No core change: the runtime is the thing worth sharing, not the instance |
| The three verbs | **Apply** makes the running program match the editor · **Save** persists the snapshot · **Revert** returns to the last saved state | With a live instance an edit has already changed something. Conflating "make it true" with "write it down" is the trap |
| Undo | Per-edit and text-only, exactly as now. Saving does NOT clear the stack | Ten edits then a save then undo should step back one edit, not to the save point. Every editor people know behaves this way |
| Dirty | A CONTENT comparison against the last saved document, never a history position | Undo one edit, type a different one, and the depth matches again while the content differs. At document sizes a comparison is free |
| Input values | Dirty the document, but do not enter the undo stack | They are values, not edits. The user agreed this is right |
| Port edits | Their own affordance, not a second competing stack. **Shipped in Phase 3:** removing a port is revertible for eight seconds (`usePortEdits`), and the removed input's value travels with it so a revert loses nothing. Version history later | Two stacks means undo does something surprising depending on what you touched last |
| Version history | Host work. A snapshot is already a self-contained memento and restoring one is `setProgram` | Identity, timestamps and revisions belong to the host envelope, which the architecture already says |
| The revision field | **Decide it now**, before documents exist | Two people editing one program is a conflict a client cannot detect without one, and retrofitting it into stored documents is unpleasant |
| Remote commands | Fire-and-forget, ordered, sequence-numbered. Results arrive on the observables | Every command already returns void and reports through observables. The interface was accidentally built for this |
| Remote state | Pushes of the five observables, with all five current values as the opening message | A replica must never render empty |
| The one interface change | `setLayer` stops returning `PortProblem[]` synchronously and reports them as `ports` diagnostics. `setProgram` throwing on ports with no persisted layer needs the same | A synchronous return cannot cross a wire, and the diagnostics channel already carries the layer id and the offending row |
| Authorisation | At the transport seam, enforced from `LayerPolicy` | The policy already says who may edit and who feeds each layer. Server-side it stops advertising and starts enforcing |
| Analysis | Local, always. Execution may be remote | Diagnostics must not wait for a round trip. Requires the client to import the same language package, because a language is code: `inferOutput` and `inferInputTypes` are functions |

## Steps

Each step is useful on its own and leaves the tree green. Sizes assume the per-commit ritual:
implement, design review pass over the diff, gates, commit table, stop.

### S1 — Borrow a runtime or an instance · 2–3 hours

Files: `packages/editor/src/editor.ts`, its tests, `packages/editor/README.md`.

```ts
export type EditorConfig = OwnedConfig | AttachedConfig;

interface OwnedConfig {          // today's behaviour, unchanged
  document: EditorDocument;
  language?: Language;
  layers?: { global?: readonly PortLayer[]; program?: readonly PortLayer[] };
  onChange?(doc: EditorDocument): void;
}

interface AttachedConfig {
  /** The language the runtime was built from — the editor needs its grammar to highlight. */
  language: Language;
  runtime: Runtime;
  /** An instance to drive. Omitted: the editor creates one on that runtime (a draft). */
  instance?: ProgramInstance;
  document?: EditorDocument;     // required when no instance is given
  onChange?(doc: EditorDocument): void;
}
```

- `dispose` unregisters only an instance the editor created.
- The initial source comes from the instance's snapshot; it must be code-form, as now.
- A host's layers may carry types WITH schemas (a capability layer is code, rebuilt each boot);
  only the layer an instance persists may not, and `createInstance` already refuses that. The
  editor passes layers through untouched and never serialises a host layer.
- Tests: a borrowed instance survives disposal; an editor on a host runtime sees a global value
  the host pushed; two editors on one runtime do not interfere.

### S2 — Apply, save, revert, and a dirty flag · 3–4 hours

Files: `editor.ts`, `react/TopBar.tsx` (or the host's own), `README.md`.

```ts
interface EditorHandle {
  readonly dirty: Observable<boolean>;
  markSaved(): void;             // the host calls this after its own persistence succeeds
  revert(): void;                // back to the last saved document
  // apply is the host's: liveInstance.setProgram(editor.getDocument().program)
}
```

- Dirty compares `getDocument()` against the last saved document. Set by `markSaved`.
- Revert is `setProgram` plus the saved input values, so it is a forward command like any other,
  which matters because a live instance is watching.
- The playground ignores all three and keeps autosave.
- Tests: dirty after an edit, clean after `markSaved`, dirty again after another edit, and clean
  after undoing back to the saved content.

### S3 — Version history · host work, plus one core-adjacent decision

Nothing in core changes. What is needed:

- A `revision` on the host envelope, decided before documents accumulate.
- A store keyed by document id holding an append-only list of snapshots with author and time.
- Restoring is `instance.setProgram(saved.program)` plus its input values, which already exists.

### S4 — The transport · only once there is a real API

Files: a new `packages/core/src/language/runtime/remote.ts`, or a separate package.

```ts
createRemoteInstance(channel: Channel, id: string): ProgramInstance;
```

- Client to server: `{ seq, kind: "setInput" | "fireTrigger" | "setProgram" | "setLayer", … }`.
- Server to client: `{ kind: "snapshot" | "diagnostics" | "ports" | "outputs" | "values", … }`,
  the opening message carrying all five.
- Reconnect re-requests the opening snapshot rather than replaying commands.
- Do the `setLayer` interface change first, as its own commit, since it stands alone.

## Making a remote runtime feel local

1. **Analyse locally.** Diagnostics and highlighting never touch the network. Building a
   `ProgramEnvironment` from the layers the instance publishes is pure.
2. **Echo values optimistically** into the local replica, or a dragged slider fights the user.
3. **Drop stale pushes** that predate a command already sent — the sequence number's real job.
4. **Show connection state**, and mark outputs `stale` while disconnected. The flag exists and
   means exactly that.
5. **Block Apply while disconnected; allow editing and saving.** Queuing edits and firing them
   thirty seconds later is dangerous during a show.

## Not in this plan

- A rete (graph) editing mode.
- Multi-document or workspace editing.
- Collaborative editing beyond detecting a conflict via the revision.
- Validation of values at the boundary — its own entry in `todo.md`, and independent of this.
