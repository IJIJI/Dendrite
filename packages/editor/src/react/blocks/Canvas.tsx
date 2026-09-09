import { type CSSProperties, useEffect, useRef } from "react";

import { type CodeOptions } from "../../code/cm";
import { useEditorContext } from "../context";
import { cx } from "../cx";

//? <Editor.Canvas/>: the code editor itself - the one element createEditor can mount into,
// so this is where the session is born, and where the code's own options (editable, the
// gutter) are set. Siblings render their empty state until it has mounted.

export interface CanvasProps extends CodeOptions {
  className?: string;
  style?: CSSProperties;
}

export function Canvas({ editable, gutters, className, style }: CanvasProps) {
  const { attach } = useEditorContext();
  const ref = useRef<HTMLDivElement>(null);

  // Keyed on the two primitives, never on an options object: a host writing
  // `code={{ editable: false }}` makes a fresh object every render, and only a real change
  // should remount the editor (it does - the history goes with it).
  useEffect(
    () => (ref.current ? attach(ref.current, { editable, gutters }) : undefined),
    [attach, editable, gutters],
  );

  return <div ref={ref} className={cx("dendrite-canvas", className)} style={style} />;
}
