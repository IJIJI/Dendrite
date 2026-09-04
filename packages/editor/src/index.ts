//? @dendrite-lang/editor — public API (framework-free).
//
// The editor's headless core: the compile/run session, the CodeMirror adapter, the
// document model + codec, and (later) stores + createEditor for hosts. The React UI lives
// under the ./react subpath and is the only place React is allowed (.docs/editor-plan.md).

export * from "./session"; // PlaygroundSession, Diagnostic, RunResult, SessionCallbacks
export * from "./tokens"; // styledRanges, lineStartOffsets, toOffset, TokenClass, StyledRange
export * from "./cm"; // dendriteHighlighting, toLintDiagnostics (the only CodeMirror-aware module)
export * from "./input-widgets"; // widgetsFor, initialValueFor, WidgetSpec, Control
export * from "./surface"; // SurfaceSpec (+ parts), applySurface
export * from "./document"; // PlaygroundDocument, DOCUMENT_VERSION, isDocument, cloneDocument
export * from "./permalink"; // encodeDocument, decodePayload
