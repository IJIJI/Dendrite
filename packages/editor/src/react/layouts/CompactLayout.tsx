import { Actions, defaultEnd } from "../blocks/Actions";
import { Canvas } from "../blocks/Canvas";
import { Diagnostics } from "../blocks/panes/Diagnostics";
import { Inputs } from "../blocks/panes/Inputs";
import { Outputs } from "../blocks/panes/Outputs";
import { TopBar } from "../blocks/TopBar";
import { cx } from "../cx";
import { Column, type LayoutConfig, Row } from "./Layout";

//? <Editor.CompactLayout/>: the code with the inputs and outputs beside it when there is
// room and below it when there is not (a flex wrap, no media query), the actions in the
// code's corner, and Diagnostics collapsed to one line that counts the problems. The
// middle of the scale (Minimal · Compact · Full): lint dots but no line numbers, the
// declaration affordances where the layer allows them. The code follows its content up
// to --dendrite-compact-max-height, then scrolls.

export type CompactLayoutProps = LayoutConfig;

export function CompactLayout({
  code,
  declarations = true,
  end = defaultEnd,
  topBar,
  className,
  style,
}: CompactLayoutProps) {
  return (
    <Column className={cx("dendrite-compact-layout", className)} style={style}>
      {topBar ? <TopBar {...topBar} end={topBar.end ?? end} /> : null}
      <Row className="dendrite-compact-body">
        <div className="dendrite-code">
          <Canvas gutters="compact" {...code} />
          {!topBar && end.length > 0 ? <Actions items={end} /> : null}
        </div>
        <Column className="dendrite-compact-side">
          <Inputs declarations={declarations} />
          <Outputs declarations={declarations} />
        </Column>
      </Row>
      <Diagnostics collapsible />
    </Column>
  );
}
