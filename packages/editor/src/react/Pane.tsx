import { type CSSProperties, type ReactNode, useId } from "react";

import { cx } from "./cx";

//? The frame every side pane shares: a section with a small uppercase heading that doubles
// as its accessible name. Hosts retitle it (Beacon: "Live state") or hide it (`null`).

export interface PaneProps {
  /** Heading text; omit for the pane's default, `null` to render no heading. */
  title?: string | null;
  className?: string;
  style?: CSSProperties;
}

export function Pane({
  title,
  defaultTitle,
  kind,
  className,
  style,
  children,
}: PaneProps & { defaultTitle: string; kind: string; children: ReactNode }) {
  const id = useId();
  const heading = title === undefined ? defaultTitle : title;
  return (
    <section
      className={cx("dendrite-pane", `dendrite-${kind}`, className)}
      style={style}
      aria-labelledby={heading === null ? undefined : id}
    >
      {heading === null ? null : (
        <h2 id={id} className="dendrite-pane-title">
          {heading}
        </h2>
      )}
      {children}
    </section>
  );
}
