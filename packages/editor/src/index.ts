//? @dendrite-lang/editor — public API (framework-free).
//
// The editor's headless core: the compile/run session, the CodeMirror adapter, the
// document model + codec, and (later) stores + createEditor for hosts. The React UI lives
// under the ./react subpath and is the only place React is allowed (.docs/editor-plan.md).

export * from "./observable"; // watch, + Observable, Subject, createSubject re-exported from core
export * from "./session"; // EditorSession, Diagnostic, RunResult, InputValues
export * from "./tokens"; // styledRanges, lineStartOffsets, toOffset, TokenClass, StyledRange
export * from "./cm"; // dendriteHighlighting, toLintDiagnostics (the only CodeMirror-aware module)
export * from "./input-widgets"; // widgetsFor, initialValueFor, WidgetSpec, Control
export * from "./format"; // formatValue - the one value→text rule panes share
export * from "./surface"; // SurfaceSpec (+ parts), applySurface
export * from "./surface-edit"; // add/update/remove inputs + outputs, validateSurface, typeOptions - editing the surface as data
export * from "./document"; // EditorDocument, DOCUMENT_VERSION, isDocument, migrateDocument, cloneDocument
export * from "./permalink"; // encodeDocument, decodePayload
export * from "./store"; // DocumentStore + MemoryStore, LocalStorageStore, UrlStore
export * from "./editor"; // createEditor, EditorConfig, EditorHandle - the host entry point
export * from "./theme"; // getTheme, ThemeMode - the page's colour scheme (auto / light / dark)
