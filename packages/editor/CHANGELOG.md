# Changelog

Changes to `@dendrite-lang/editor`, newest first. Every version is tagged
`@dendrite-lang/editor@<version>`; its date is on the
[GitHub release](https://github.com/IJIJI/Dendrite/releases) that ships it, which covers every
package released at the same time.

The version follows [semantic versioning](https://semver.org/). Before 1.0 a **minor** bump may
break the API. This package declares `@dendrite-lang/core` as a peer at `^0.1.0`: a minor release
of core needs a release here too, even if nothing in this package changed.

## Unreleased

- **`require()` works.** Each entry gained a `default` export condition beside `import`, so
  `require("@dendrite-lang/editor")` and `.../react` resolve. The package is still ESM, so this
  needs a Node that can `require()` an ES module (22.12 or later, or 20.19 or later).

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
