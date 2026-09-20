# Changelog

Changes to `@dendrite-lang/editor`, newest first. Every version is tagged
`@dendrite-lang/editor@<version>`; its date is on the
[GitHub release](https://github.com/IJIJI/Dendrite/releases) that ships it, which covers every
package released at the same time.

The version follows [semantic versioning](https://semver.org/). Before 1.0 a **minor** bump may
break the API. This package declares `@dendrite-lang/core` as a peer at `^0.2.0`: a minor release
of core needs a release here too, even if nothing in this package changed.

## 0.2.0

- **`require()` works.** Each entry gained a `default` export condition beside `import`, so
  `require("@dendrite-lang/editor")` and `.../react` resolve. The package is still ESM, so this
  needs a Node that can `require()` an ES module (22.12 or later, or 20.19 or later).
- **Types have a colour.** A registered type's name is highlighted as a type where a type is
  written: after a `:` or `->`, among a function type's parameters, or as a type written on its own
  (`number[]`). A binding that shares a type's name stays an identifier. It is a new `tok-type`
  class with a `--dendrite-syntax-type` token for themes to override, and `TokenClass` gains
  `"type"`: code with an exhaustive `switch` over it has a case to add. The colour is plain ink
  (`--dendrite-muted`), chosen by eye over a teal and a set of cyans: a type is a kind of value,
  not a value, so it steps back instead of competing with the ops and inputs. Known limit: in
  `If(then: number)`, a binding called `number` passed by name reads as the type.
- **Comments are one step fainter**, `--dendrite-faint` rather than `--dendrite-muted`, so they sit
  below the new type colour. They stay italic, which is what keeps them apart from punctuation,
  which shares that grey.
- **A program that was already broken shows it on mount.** An `Observable` reports changes
  only, so an editor mounted over a program that does not compile - a documented sample, a
  saved program that no longer does - painted no squiggles until the first keystroke. The
  diagnostics that exist when the editor mounts are painted straight away.
- **`stale` on a layout and on the Outputs pane.** Default true: while a program does not
  compile the last good values stay on screen, marked stale, which is what a host acting on
  outputs needs. `false` leaves them out, for a place where the program is the point - a
  documented sample then reads the same on the page as it does after an edit that breaks it.
  What the instance holds is unchanged either way; this is one pane's view of it.
- **Minimal keeps its actions on the right** when the program declares no inputs and the input
  strip is empty, instead of sliding them to the left edge.
- **An output line shows its declared type.** `MinimalLayout`'s outputs read
  `result: number = 10` rather than `result = 10`; the `=` moved onto the value, so a declared
  output the program never assigned no longer carries a stray one. Status tags (`stale`,
  `undeclared`) stay out of a line, as before.
- **A compact editor's two columns are the same height.** Side by side, the code sat short
  beside a taller side column; both now fill the row, the code canvas with them, and a long
  pane scrolls inside `--dendrite-compact-max-height` rather than stretching the block. Below
  44rem of the editor's own width - where its two columns stop fitting - the row wraps as
  before and the code follows its content.
- **The npm page** carries the Dendrite wordmark, and version, docs and licence badges.

## 0.1.0

The first release.

- **A code editor over a running program**, built on CodeMirror, with highlighting driven by the
  language's own lexer and diagnostics shown as squiggles and gutter markers.
- **Connections.** `ownStack` for an editor that owns its language, runtime and instance;
  `joinRuntime` for its own instance on a runtime the host runs; `attach` for a program the host
  already has, local or through `@dendrite-lang/link`. The editor releases only what it made.
- **Headless.** `createEditor` with `editable` and `gutters` options, and everything the React
  components are built from, usable without React.
- **React components** under `@dendrite-lang/editor/react`: `<Editor>`, the canvas, the Inputs,
  Outputs and Diagnostics panes, the top bar, an actions cluster, and a static `Source` block.
- **Three layouts** on one `LayoutConfig`: `MinimalLayout`, `CompactLayout` and `FullLayout`, each
  choosing where its actions sit from its own set of spots.
- **Documents.** A versioned document envelope with migrations, `MemoryStore`, `LocalStorageStore`
  and `UrlStore`, and `documentUrl` for links that open a document.
- **Static highlighting** without an editor: `sourceParts` and `sourceHtml`.
- **Theming** through `--dendrite-*` CSS variables in its own cascade layer, following the system's
  light or dark setting.

Known limits: code only - the visual graph editor is not part of this release.
