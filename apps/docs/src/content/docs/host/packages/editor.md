---
title: "@dendrite-lang/editor"
description: "A code editor over a running program: three ways to connect, three layouts, and the blocks they are made of."
sidebar:
  order: 2
---

A code editor for Dendrite, built on CodeMirror. It edits **one running program** and highlights
with **one language**, and it does not care where either came from.

Two entry points. The headless one, `@dendrite-lang/editor`, has no framework in it at all. The
React components live under `@dendrite-lang/editor/react`, which is the only place in the package
React is allowed, so a host that does not use React never loads it.

## Where the program comes from: a connection

The one decision a host makes is how the editor reaches a program. That is a `Connection`, and there
are three ways to get one.

| Connection | The editor gets | Use it when |
| --- | --- | --- |
| `ownStack({ document, language?, layers? })` | its own private language, runtime and instance | the editor *is* the application - a playground, a scratchpad |
| `joinRuntime(language, runtime, { document })` | its own instance, on a runtime the host already runs | a draft beside live programs, seeing the host's real global values |
| `attach(language, instance)` | an instance the host already has | editing a program that is running for real, locally or through the link |

Releasing is asymmetric on purpose: the editor tears down **only what it made**. `ownStack` made
everything, so it disposes everything. `attach` made nothing, so disposing the editor leaves your
program running.

## React

```tsx
import "@dendrite-lang/editor/style.css";
import { Editor } from "@dendrite-lang/editor/react";

<Editor document={doc} language={myLanguage} onChange={(d) => save(d)}>
  <Editor.FullLayout />
</Editor>;
```

`<Editor>` takes a `connection`, or `document` as a shorthand for `ownStack`. Pass stable references:
a new connection, document, language or layers remounts the editor. `onChange` fires debounced, for
anything a save would capture, and is read through a ref so replacing it does not remount.

### Three layouts

Three presets on one scale, from a snippet in a page to a whole application. They take the same
configuration and differ in arrangement and defaults.

| Layout | Arrangement |
| --- | --- |
| `Editor.MinimalLayout` | the inputs in a strip, the code, the outputs as `→ name = value` lines. No gutter, no diagnostics pane - a problem shows as a squiggle with its message on hover. Its height follows its content |
| `Editor.CompactLayout` | the code with the inputs and outputs beside it, below it when narrow, and diagnostics collapsed to one counting line |
| `Editor.FullLayout` | the playground: a top bar, the code, and three panes stacked beside it, filling its parent |

The live examples throughout these docs are the first two. What they share:

| Option | Meaning |
| --- | --- |
| `code` | `{ editable, gutters }`. Every layout is editable by default; `gutters` is `full`, `compact` (lint dots only) or `none` |
| `declarations` | whether the panes offer rename, retype, add and remove, where the layer allows it |
| `actions` | the buttons: the editor's own (`Editor.items.undo`, `.redo`, `.theme`) and yours. Listing replaces |
| `actionsAt` | where they go. Each layout offers its own spots - the top bar's start or end, the code's corner, the side, the input strip - and a spot a layout cannot show does not compile |
| `topBar` | a top bar, whole. Omit for none |

### The blocks, when no preset fits

A layout is only a composition of blocks, and the blocks are public:

```tsx
<Editor document={doc} onChange={save}>
  <Editor.TopBar title="Live tally" />
  <Editor.Row grow>
    <Editor.Column grow>
      <Editor.Canvas />
    </Editor.Column>
    <Editor.Column size="20rem">
      <Editor.Inputs title="Live state" readOnly={(name) => live.has(name)} />
      <Editor.Outputs />
      <Editor.Diagnostics />
    </Editor.Column>
  </Editor.Row>
</Editor>;
```

`Canvas` is the code, and it is required: it is where the program is born. `Inputs`, `Outputs` and
`Diagnostics` are the panes. `TopBar` and `Actions` hold items. `Row` and `Column` lay them out.
`Source` renders a program as highlighted static code with no editor behind it, for showing a
program you do not want to run.

`readOnly` on `Inputs` is host policy, deliberately not part of the document: the same program can be
host-fed in one application and user-edited in another.

## Headless

```ts
import { createEditor, ownStack, watch } from "@dendrite-lang/editor";

const editor = createEditor(element, {
  connection: ownStack({ document }),
  onChange: (doc) => save(doc),
});

watch(editor.instance.outputs, (result) => render(result));
editor.instance.setInput("score", 42);
editor.dispose();
```

`editor.instance` is the same five observables and four commands as any core instance, whatever the
connection. Render your own panes from them.

## Saving, and sharing

The editor never touches storage. It hands you a document through `onChange`; where it goes is your
decision. Three stores are included for the common cases - `MemoryStore`, `LocalStorageStore`,
`UrlStore` - and `documentUrl(base, doc)` turns a document into a link, which is how "open in the
playground" works everywhere on this site.

A document is core's snapshot with a version on the outside, and it migrates forward on load, so a
link made today opens next year.

## Theming

`style.css` lives in its own cascade layer, so your own un-layered rules win without specificity
fights. Every colour is a `--dendrite-*` variable: override those and you have rethemed it, with no
need for the brand. It follows the system's light or dark setting, or a host forces one with
`data-dendrite-theme` on the root element. Fonts are not loaded for you.

**Next:** [@dendrite-lang/link](../link/).
