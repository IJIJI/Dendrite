import { type CSSProperties, useEffect, useRef } from "react";

import { useEditorContext } from "./context";
import { cx } from "./cx";

//? <Editor.Canvas/>: the code editor itself - the one element createEditor can mount into,
// so this is where the session is born. Siblings render their empty state until it has.

export interface CanvasProps {
  className?: string;
  style?: CSSProperties;
}

export function Canvas({ className, style }: CanvasProps) {
  const { attach } = useEditorContext();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => (ref.current ? attach(ref.current) : undefined), [attach]);

  return <div ref={ref} className={cx("dendrite-canvas", className)} style={style} />;
}
