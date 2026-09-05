import { type CSSProperties, type ReactNode } from "react";

import { cx } from "./cx";

//? <Editor.Row/> / <Editor.Column/>: flex primitives so a host composes a layout without
// writing CSS. `grow` fills the parent; `size` fixes the basis (width in a Row, height in
// a Column). Draggable splitters can be layered on later without changing the API.

export interface LayoutProps {
  grow?: boolean;
  size?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

const boxStyle = (size: string | undefined, style: CSSProperties | undefined) =>
  size ? { flexBasis: size, flexShrink: 0, ...style } : style;

export function Row({ grow, size, className, style, children }: LayoutProps) {
  return (
    <div
      className={cx("dendrite-row", grow && "dendrite-grow", className)}
      style={boxStyle(size, style)}
    >
      {children}
    </div>
  );
}

export function Column({ grow, size, className, style, children }: LayoutProps) {
  return (
    <div
      className={cx("dendrite-column", grow && "dendrite-grow", className)}
      style={boxStyle(size, style)}
    >
      {children}
    </div>
  );
}
