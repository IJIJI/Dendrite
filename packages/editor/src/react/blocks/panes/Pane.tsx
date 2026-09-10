import { type CSSProperties, type ReactNode, useId } from "react";

import { cx } from "../../cx";

//? The frame every side pane shares: a section with a small uppercase heading that doubles
// as its accessible name. Hosts retitle it (Beacon: "Live state") or hide it (`null`).
// Collapsible, it is a <details>: closed by default, never opens on its own, keyboard and
// screen reader for free; the heading and a one-line `summary` make up its summary line.

export interface PaneProps {
  /** Heading text; omit for the pane's default, `null` to render no heading. */
  title?: string | null;
  /** Render as a closed <details> whose summary line is the heading plus `summary`. */
  collapsible?: boolean;
  /** What the collapsed line says beside the heading ("No problems", "2 errors"). */
  summary?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Pane({
  title,
  defaultTitle,
  kind,
  collapsible = false,
  summary,
  className,
  style,
  children,
}: PaneProps & { defaultTitle: string; kind: string; children: ReactNode }) {
  const id = useId();
  const heading = title === undefined ? defaultTitle : title;
  const label = heading === null ? undefined : id;
  const h2 =
    heading === null ? null : (
      <h2 id={id} className="dendrite-pane-title">
        {heading}
      </h2>
    );
  const classes = cx("dendrite-pane", `dendrite-${kind}`, className);

  if (collapsible) {
    return (
      <details className={classes} style={style} aria-labelledby={label}>
        <summary className="dendrite-pane-toggle">
          {h2}
          {summary !== undefined ? <span className="dendrite-pane-summary">{summary}</span> : null}
        </summary>
        {children}
      </details>
    );
  }
  return (
    <section className={classes} style={style} aria-labelledby={label}>
      {h2}
      {children}
    </section>
  );
}
