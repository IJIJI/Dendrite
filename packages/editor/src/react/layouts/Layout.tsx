import { type CSSProperties, type ReactNode } from "react";

import { type CodeOptions } from "../../code/cm";
import { type TopBarItem } from "../blocks/Actions";
import { type TopBarProps } from "../blocks/TopBar";
import { cx } from "../cx";

//? <Editor.Row/> / <Editor.Column/>: flex primitives so a host composes a layout without
// writing CSS. `grow` fills the parent; `size` fixes the basis (width in a Row, height in
// a Column). Draggable splitters can be layered on later without changing the API.
// LayoutConfig is what every preset (Minimal, Compact, Full) takes: the same four choices,
// each preset with its own defaults, so a host switches presets without moving props.

export interface LayoutConfig {
  /** The code's own options (`editable`, `gutters`); each preset has its own defaults. */
  code?: CodeOptions;
  /** Declaration affordances in the port panes (rename, type, add, remove); values stay settable. */
  declarations?: boolean;
  /**
   * The actions cluster: the bar's end when there is a bar, the code's corner otherwise.
   * Default the editor's own controls (`defaultEnd`). Listing replaces, never merges.
   */
  end?: readonly TopBarItem[];
  /** A top bar, whole; omit for none. Its own `end`, when set, wins over the layout's. */
  topBar?: TopBarProps;
  className?: string;
  style?: CSSProperties;
}

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
