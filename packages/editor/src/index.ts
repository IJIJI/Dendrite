//? @dendrite-lang/editor — public API (framework-free).
//
// The editor's headless core: the compile/run session, the CodeMirror adapter, the
// document model + codec, and (later) stores + createEditor for hosts. The React UI lives
// under the ./react subpath and is the only place React is allowed (.docs/editor-plan.md).

export * from "./observable"; // watch, + Observable, Subject, createSubject re-exported from core
export * from "./code/tokens"; // styledRanges, lineStartOffsets, toOffset, TokenClass, StyledRange
export * from "./code/source"; // sourceParts, sourceHtml - a program highlighted for a static rendering
export * from "./code/cm"; // dendriteHighlighting, toLintDiagnostics (the only CodeMirror-aware module)
export * from "./ports/port-rows"; // widgetsFor, outputRows, editableLayer - declarations as pane rows
export * from "./ports/format"; // formatValue - the one value→text rule panes share
export * from "./ports/ports-edit"; // add/update/remove inputs + outputs, typeOptions, uniqueName - a layer as editable data
export * from "./code/diagnostic"; // positionOf - the one SourceRef → line/column adapter; sortDiagnostics, summarise
export * from "./session/document"; // EditorDocument, DOCUMENT_VERSION, isDocument, migrateDocument, cloneDocument
export * from "./session/permalink"; // encodeDocument, decodePayload
export * from "./session/store"; // DocumentStore + MemoryStore, LocalStorageStore, UrlStore
export * from "./session/connection"; // Connection + ownStack / joinRuntime / attach - where the instance comes from
export * from "./session/editor"; // createEditor, EditorConfig, EditorHandle - the host entry point
export * from "./theme"; // getTheme, ThemeMode - the page's colour scheme (auto / light / dark)
