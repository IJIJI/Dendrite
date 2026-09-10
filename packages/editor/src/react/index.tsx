//? @dendrite-lang/editor/react - compound components over the headless editor. A host lays
// them out however it likes inside <Editor>; layout presets are just compositions. This is
// the ONLY place React is allowed in the package (lint-enforced): the core stays headless.
// Styles: import "@dendrite-lang/editor/style.css" once; theme via --dendrite-* variables.

import { Actions, items } from "./blocks/Actions";
import { Canvas } from "./blocks/Canvas";
import { Diagnostics } from "./blocks/panes/Diagnostics";
import { Editor as EditorRoot } from "./Editor";
import { Inputs } from "./blocks/panes/Inputs";
import { CompactLayout } from "./layouts/CompactLayout";
import { FullLayout } from "./layouts/FullLayout";
import { Column, Row } from "./layouts/Layout";
import { MinimalLayout } from "./layouts/MinimalLayout";
import { Outputs } from "./blocks/panes/Outputs";
import { Source } from "./blocks/Source";
import { TopBar } from "./blocks/TopBar";

export const Editor = Object.assign(EditorRoot, {
  TopBar,
  Canvas,
  Inputs,
  Outputs,
  Diagnostics,
  Actions,
  Source,
  Row,
  Column,
  MinimalLayout,
  CompactLayout,
  FullLayout,
  /** The editor's own controls as items: `end: [Editor.items.undo, Editor.items.redo, share]`. */
  items,
});

export { useEditor } from "./context";
export { Wordmark } from "./brand";
export { defaultEnd } from "./blocks/Actions";
export type { EditorProps } from "./Editor";
export type { CanvasProps } from "./blocks/Canvas";
export type { SourceProps } from "./blocks/Source";
export type { PaneProps } from "./blocks/panes/Pane";
export type { InputsProps, ReadOnly } from "./blocks/panes/Inputs";
export type { OutputsProps } from "./blocks/panes/Outputs";
export type { TopBarProps } from "./blocks/TopBar";
export type {
  ActionsProps,
  TopBarItem,
  TopBarAction,
  BuiltIn,
  Menu,
  MenuItem,
} from "./blocks/Actions";
export type { IconName } from "./icons";
export type { LayoutProps, LayoutConfig } from "./layouts/Layout";
export type { MinimalLayoutProps } from "./layouts/MinimalLayout";
export type { CompactLayoutProps } from "./layouts/CompactLayout";
export type { FullLayoutProps } from "./layouts/FullLayout";
