import { type CSSProperties, type ReactNode } from "react";

import { Wordmark } from "../brand";
import { cx } from "../cx";
import { Actions, defaultActions, type TopBarItem } from "./Actions";

//? <Editor.TopBar/>: brand · start items · centred title · end items. Both sides are
// Actions clusters, so anything an item can be (a menu, an icon action, an element, one of
// the editor's own controls) goes on either side; the host decides. Works with or without
// an <Editor> around it - the built-ins that need one render nothing outside it.

export interface TopBarProps {
  /** Centred document title. */
  title?: string;
  /** Replaces the Dendrite wordmark. */
  brand?: ReactNode;
  /** Items after the brand: menus, typically. */
  start?: readonly TopBarItem[];
  /** Items at the far end. Default: the editor's own controls (`defaultActions`); listing replaces. */
  end?: readonly TopBarItem[];
  className?: string;
  style?: CSSProperties;
}

const defaultBrand = <Wordmark />;

export function TopBar({
  title,
  brand = defaultBrand,
  start = [],
  end = defaultActions,
  className,
  style,
}: TopBarProps) {
  return (
    <header className={cx("dendrite-topbar", className)} style={style}>
      <div className="dendrite-topbar-start">
        <span className="dendrite-brand">{brand}</span>
        {start.length > 0 ? (
          <>
            <span className="dendrite-topbar-sep" />
            <Actions items={start} />
          </>
        ) : null}
      </div>
      <div className="dendrite-topbar-title" title={title}>
        {title}
      </div>
      <Actions items={end} className="dendrite-topbar-end" />
    </header>
  );
}
