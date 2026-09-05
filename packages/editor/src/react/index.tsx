//? @dendrite-lang/editor/react - compound components over the headless editor. A host lays
// them out however it likes inside <Editor>; layout presets are just compositions. This is
// the ONLY place React is allowed in the package (lint-enforced): the core stays headless.
// Styles: import "@dendrite-lang/editor/style.css" once; theme via --dendrite-* variables.

import { Canvas } from "./Canvas";
import { DefaultLayout } from "./DefaultLayout";
import { Diagnostics } from "./Diagnostics";
import { Editor as EditorRoot } from "./Editor";
import { Inputs } from "./Inputs";
import { Column, Row } from "./Layout";
import { Outputs } from "./Outputs";
import { TopBar } from "./TopBar";

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
export type { EditorProps } from "./Editor";
export type { CanvasProps } from "./Canvas";
export type { PaneProps } from "./Pane";
export type { InputsProps, ReadOnly } from "./Inputs";
export type { TopBarProps, TopBarAction, Menu, MenuItem } from "./TopBar";
export type { IconName } from "./icons";
export type { LayoutProps } from "./Layout";
export type { DefaultLayoutProps } from "./DefaultLayout";
