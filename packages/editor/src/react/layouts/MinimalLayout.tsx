import { Actions, defaultEnd } from "../blocks/Actions";
import { Canvas } from "../blocks/Canvas";
import { Inputs } from "../blocks/panes/Inputs";
import { Outputs } from "../blocks/panes/Outputs";
import { TopBar } from "../blocks/TopBar";
import { cx } from "../cx";
import { Column, type LayoutConfig } from "./Layout";

//? <Editor.MinimalLayout/>: a program in a page - the inputs in one line above, the code,
// the outputs as lines below, the actions in the code's corner. The bottom of the scale
// (Minimal · Compact · Full): no gutter, no declaration affordances, no Diagnostics pane -
// a problem shows as a squiggle with its message on hover. The height follows the content.
// Editable like every preset; a documented example passes `code={{ editable: false }}`.
// A program with no inputs shows no input strip (style.css hides the empty pane).

export interface MinimalLayoutProps extends LayoutConfig {
  /** The inputs as one wrapping line of fields, or stacked rows (for multi-line values). */
  inputs?: "row" | "stacked";
}

export function MinimalLayout({
  code,
  declarations = false,
  end = defaultEnd,
  topBar,
  inputs = "row",
  className,
  style,
}: MinimalLayoutProps) {
  return (
    <Column className={cx("dendrite-minimal-layout", className)} style={style}>
      {topBar ? <TopBar {...topBar} end={topBar.end ?? end} /> : null}
      <Inputs
        title={null}
        declarations={declarations}
        className={inputs === "row" ? "dendrite-inputs-inline" : undefined}
      />
      <div className="dendrite-code">
        <Canvas gutters="none" {...code} />
        {!topBar && end.length > 0 ? <Actions items={end} /> : null}
      </div>
      <Outputs title={null} declarations={declarations} className="dendrite-outputs-lines" />
    </Column>
  );
}
