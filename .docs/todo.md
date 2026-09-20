# Dendrite — Todo

The near future: what is being worked on now, and what comes straight after. Anything for
some later point in time is in `backlog.md`; finished work, kept for its reasoning, is in
`done.md`.

---

## Docs — review the rest of the site after Learn

**What:** the user is reading the docs page by page and sending observations. Learn comes first
(its observations were the samples step, now in `done.md`); **then** How it works, Host
developers and the stdlib reference, the same way. The site-wide passes (the colouring, the
dashes, the chain) already landed with the samples step, so these pages start from them.

**When:** next, alongside the inline TypeScript colouring: the user reads, and the
observations collect here until there is a section's worth to plan.

---

## Docs — inline TypeScript in the site's own colours

**What:** inline TypeScript on Host and How it works (`createInstance(runtime, options)`,
`Observable<T>`, `Policy.host`) is plain grey today, while code blocks wear the site's TypeScript
theme. Colour it the same way Dendrite snippets are coloured, by explicit marking:
`createInstance(runtime, options){:ts}`, the `{:den}` convention with another language.

Decided while planning the samples step (2026-09-19):

- **Shiki**, already installed with Astro, highlights a `{:ts}` snippet in `remark-den.ts` (or a
  sibling `remark-ts-inline.ts`, if it reads better apart), with `night-owl` and
  `night-owl-light` as dual themes: the pair Starlight's Expressive Code uses for its blocks,
  switched on Starlight's `data-theme` the same way. `shiki` becomes an explicit docs
  devDependency rather than a transitive one.
- **Close is enough.** Expressive Code lifts its blocks' token contrast, so in light mode an inline
  token can be a little lighter than the same token in a block. The check is "same palette,
  readable", not identical colours.
- **`hostCodeParts`** on *Every diagnostic*, the one TypeScript block still coloured by hand, is
  printed as a string and highlighted by the same Shiki call, so it and its `escape`/`partsHtml`
  go.
- **Marking by hand, from a list.** Package names, CSS variables, paths and URLs stay plain. The
  Dendrite hiding among them was marked `{:den}` in the samples step, including host-only names
  that stay plain on purpose (`Reading`, `Mod`, `Last`, `%`: the docs highlighter knows only the
  stdlib, so they would come out in the wrong colour).

**The list** (the samples step's classifier, 2026-09-19): every unmarked inline snippet that is
not Dendrite, by page. `ts` is what the classifier recognised as TypeScript; `unsure` is the rest,
where a hand pass decides between `{:ts}` and plain (a field name like `stale: true` is TypeScript;
`ws://localhost:8787` or `changedInputs ∩ dependsOn ≠ ∅` is not).

- `contribute/index.md` (unsure, 1): `.docs/`
- `host/embedding-core.md` (ts, 15): `get()`, `subscribe(listener)`, `setInput(name, value)`, `fireTrigger(name, value)`, `setProgram(saved)`, `setLayer(id, ports)`, `dispose()`, `runtime.updateInputs({ ... })`, `instance.setInput(name, value)`, `instance.setInput`, `updateInputs`, `run(program, descriptor, inputs)`, `createProgramRunner(program, descriptor)`, `createRuntime()`, `createInstance(runtime, …)`
- `host/embedding-core.md` (unsure, 13): `Observable`, `outputs`, `{ outputs, error, stale }`, `diagnostics`, `values`, `ports`, `snapshot`, `stale: true`, `required`
- `host/extending-the-language.md` (ts, 8): `createStdlib()`, `createLanguage()`, `BP.MULTIPLY`, `BP.ADD`, `registerPrefix`, `inferOutput`, `inferInputTypes`
- `host/extending-the-language.md` (unsure, 11): `Reading`, `extends`, `schema`, `category`, `description`, `examples`, `BP`, `undefined`, `%`, `Last`, `Mod`
- `host/installation.md` (ts, 10): `^0.1.0`, `createStdlib()`, `createLanguage()`, `createRuntime`, `createInstance`, `SavedProgram`, `serialiseSource(text, ports?)`, `program.ports`, `inputValues`, `type`
- `host/installation.md` (unsure, 14): `instanceof EvalError`, `layers`, `required`, `desired`, `program`, `document`, `id`, `default`, `trigger`, `mode`
- `host/packages/core.md` (ts, 26): `createStdlib`, `createLanguage`, `extendLanguage`, `extendStdlib`, `operationNode`, `createEnvironment`, `createRuntime`, `createInstance`, `forProgram`, `createProgramRunner`, `Type.number`, `Type.array(…)`, `Type.fn(…)`, `typeToString`, `isCompatible`, `Policy.host`, `Policy.user`, `composeLayers`, `serialiseSource`, `SavedProgram`, `environment.load`, `diagnosticList`, `ProgramDiagnostic`, `parseSource`, `import`
- `host/packages/core.md` (unsure, 14): `zod`, `Language`, `register*`, `BP`, `run`, `Type`, `den`, `diagnostics`, `analyse`, `evaluate`, `tokenise`, `exports`, `require`
- `host/packages/editor.md` (ts, 21): `ownStack({ document, language?, layers? })`, `joinRuntime(language, runtime, { document })`, `attach(language, instance)`, `ownStack`, `<Editor>`, `onChange`, `Editor.MinimalLayout`, `Editor.CompactLayout`, `Editor.FullLayout`, `Editor.items.undo`, `actionsAt`, `topBar`, `TopBar`, `readOnly`, `editor.instance`, `MemoryStore`, `LocalStorageStore`, `UrlStore`, `documentUrl(base, doc)`
- `host/packages/editor.md` (unsure, 24): `Connection`, `attach`, `connection`, `document`, `→ name = value`, `code`, `{ editable, gutters }`, `gutters`, `full`, `compact`, `none`, `declarations`, `actions`, `.redo`, `.theme`, `Canvas`, `Inputs`, `Outputs`, `Diagnostics`, `Actions`, `Row`, `Column`, `Source`
- `host/packages/link.md` (ts, 14): `ProgramInstance`, `inferOutput`, `setInput`, `fireTrigger`, `setProgram`, `setLayer`, `serveInstance`, `onError`, `webSocketChannel(socket)`, `messagePortChannel(port)`, `MessageChannel`
- `host/packages/link.md` (unsure, 25): `hello { protocol, vocabulary }`, `state`, `rejected`, `diagnostics`, `layers`, `outputs`, `values`, `snapshot`, `stale: true`, `hello`, `status`, `connected`, `disconnected`, `editable`, `feeds: "host"`, `Channel`, `ws`, `ws://localhost:8787`
- `how-it-works/evaluation.md` (ts, 19): `dependsOn`, `changedInputs`, `run()`, `nodeCache`, `bodyScope`, `WeakMap`, `localBindings`, `createProgramRunner()`, `createRuntime()`, `createInstance()`
- `how-it-works/evaluation.md` (unsure, 3): `changedInputs ∩ dependsOn ≠ ∅`, `undefined`, `inputs`
- `how-it-works/glossary.md` (ts, 2): `dependsOn`
- `how-it-works/glossary.md` (unsure, 4): `extends`, `editable`, `feeds`, `persisted`
- `how-it-works/persistence.md` (ts, 3): `JSON.stringify`, `SavedProgram`, `EditorDocument`
- `how-it-works/persistence.md` (unsure, 8): `code`, `rete`, `ast`, `load`, `ports`, `schema`, `.refine`, `migrate`
- `how-it-works/ports-and-layers.md` (ts, 4): `Policy.host`, `Policy.user`, `Policy.custom`, `composeLayers`
- `how-it-works/ports-and-layers.md` (unsure, 5): `editable`, `feeds`, `persisted`, `persisted: true`, `schema`
- `how-it-works/the-chain.mdx` (ts, 5): `parseSource`, `RawProgram`, `dependsOn`, `failedBindings`
- `how-it-works/the-chain.mdx` (unsure, 6): `packages/core/examples/3-(code)/`, `ident`, `"output": { "kind": "name", "name": "any" }`, `operation`, `[score]`, `ok`
- `how-it-works/types.md` (ts, 3): `isCompatible`, `inferInputTypes`, `inferOutput`
- `how-it-works/types.md` (unsure, 5): `T[]`, `T`, `Bus`, `extends`
- `index.mdx` (unsure, 1): `head`
- `learn/examples/index.mdx` (ts, 1): `GreaterThanOrEqual`
- `learn/writing/bindings-and-outputs.mdx` (unsure, 1): `;`
- `learn/writing/operators-and-symbols.mdx` (ts, 1): `GreaterThanOrEqual`
- `learn/writing/types.mdx` (unsure, 1): `undefined`
- `stdlib/index.md` (unsure, 1): `stdlib`

**When:** after the 0.2.0 release (decided 2026-09-19).

---

## Docs — show what every fence produces (candidate, not decided)

**What:** run each ```den fence at build time in `remark-den.ts` and show what it produces
beneath it (its output values, or the diagnostic it raises), the way the ops reference and
*Every diagnostic* already do. Proposed 2026-09-17 as "the step to add more editors"; left out
of the samples step because it was never decided.

**Open question:** do it, or send it to the backlog. Deferred until the site review is done
(2026-09-20): the observations on How it works, Host and the stdlib reference will show whether
the static fences there want their values, and the pages that most needed it (the ops reference,
*Every diagnostic*, the Learn samples) already show theirs.
