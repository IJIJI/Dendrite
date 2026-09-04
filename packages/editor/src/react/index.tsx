//? @dendrite-lang/editor/react - compound components over the headless editor. A host lays
// them out however it likes inside <Editor>; layout presets are just compositions. This is
// the ONLY place React is allowed in the package (lint-enforced): the core stays headless.

import { Canvas } from "./Canvas";
import { Editor as EditorRoot } from "./Editor";

export const Editor = Object.assign(EditorRoot, { Canvas });

export { useEditor } from "./context";
export type { EditorProps } from "./Editor";
export type { CanvasProps } from "./Canvas";
