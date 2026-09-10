import { type CSSProperties, type ReactNode } from "react";

import { type CodeOptions } from "../../code/cm";
import { type TopBarItem } from "../blocks/Actions";
import { type TopBarProps } from "../blocks/TopBar";
import { cx } from "../cx";
import { type ActionsPlacement } from "./placement";

//? <Editor.Row/> / <Editor.Column/>: flex primitives so a host composes a layout without
// writing CSS. `grow` fills the parent; `size` fixes the basis (width in a Row, height in
// a Column). Draggable splitters can be layered on later without changing the API.
// LayoutConfig is what every preset (Minimal, Compact, Full) takes: the same choices, each
// preset with its own defaults and its own subset of spots, so a host switches presets
// without moving props.

export interface LayoutConfig<At extends ActionsPlacement = ActionsPlacement> {
  /** The code's own options (`editable`, `gutters`); each preset has its own defaults. */
  code?: CodeOptions;
  /** Declaration affordances in the port panes (rename, type, add, remove); values stay settable. */
  declarations?: boolean;
  /**
   * The buttons: the editor's own (`Editor.items`) and the host's. Default the editor's own
   * controls (`defaultActions`). Listing replaces, never merges.
   */
  actions?: readonly TopBarItem[];
  /** Where the buttons render; each preset lists its spots and its default (placement.ts). */
  actionsAt?: At;
  /** A top bar, whole; omit for none. Its `start` and `end` are the host's own items. */
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
