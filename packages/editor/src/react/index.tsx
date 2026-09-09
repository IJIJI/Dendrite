//? @dendrite-lang/editor/react - compound components over the headless editor. A host lays
// them out however it likes inside <Editor>; layout presets are just compositions. This is
// the ONLY place React is allowed in the package (lint-enforced): the core stays headless.
// Styles: import "@dendrite-lang/editor/style.css" once; theme via --dendrite-* variables.

import { Canvas } from "./chrome/Canvas";
import { DefaultLayout } from "./layouts/DefaultLayout";
import { Diagnostics } from "./panes/Diagnostics";
import { Editor as EditorRoot } from "./Editor";
import { Inputs } from "./panes/Inputs";
import { Column, Row } from "./layouts/Layout";
import { Outputs } from "./panes/Outputs";
import { TopBar } from "./chrome/TopBar";

export const Editor = Object.assign(EditorRoot, {
  TopBar,
  Canvas,
  Inputs,
  Outputs,
  Diagnostics,
  Row,
  Column,
  DefaultLayout,
});

export { useEditor } from "./context";
export { Wordmark } from "./chrome/brand";
export type { EditorProps } from "./Editor";
export type { CanvasProps } from "./chrome/Canvas";
export type { PaneProps } from "./panes/Pane";
export type { InputsProps, ReadOnly } from "./panes/Inputs";
export type { TopBarProps, TopBarAction, Menu, MenuItem } from "./chrome/TopBar";
export type { IconName } from "./chrome/icons";
export type { LayoutProps } from "./layouts/Layout";
export type { DefaultLayoutProps } from "./layouts/DefaultLayout";
