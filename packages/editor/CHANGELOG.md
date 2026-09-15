# Changelog

Changes to `@dendrite-lang/editor`, newest first. Each version's release date is on its
[GitHub release](https://github.com/IJIJI/Dendrite/releases), tagged `@dendrite-lang/editor@<version>`.

The version follows [semantic versioning](https://semver.org/). Before 1.0 a **minor** bump may
break the API. This package declares `@dendrite-lang/core` as a peer at `^0.1.0`: a minor release
of core needs a release here too, even if nothing in this package changed.

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
