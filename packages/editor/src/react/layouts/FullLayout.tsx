import { Actions, defaultEnd } from "../blocks/Actions";
import { Canvas } from "../blocks/Canvas";
import { Diagnostics } from "../blocks/panes/Diagnostics";
import { Inputs } from "../blocks/panes/Inputs";
import { Outputs } from "../blocks/panes/Outputs";
import { TopBar } from "../blocks/TopBar";
import { cx } from "../cx";
import { Column, type LayoutConfig, Row } from "./Layout";

//? <Editor.FullLayout/>: the playground arrangement as a preset - top bar, canvas on the
// left, the three panes stacked on the right. The top of the scale (Minimal · Compact ·
// Full): every gutter, every declaration affordance, an open Diagnostics pane. A preset
// is just a composition of the same pieces a host can arrange itself.

export type FullLayoutProps = LayoutConfig;

export function FullLayout({
  code,
  declarations = true,
  end = defaultEnd,
  topBar,
  className,
  style,
}: FullLayoutProps) {
  return (
    <Column grow className={cx("dendrite-full-layout", className)} style={style}>
      {topBar ? <TopBar {...topBar} end={topBar.end ?? end} /> : null}
      <Row grow>
        <div className="dendrite-code dendrite-grow">
          <Canvas gutters="full" {...code} />
          {!topBar && end.length > 0 ? <Actions items={end} /> : null}
        </div>
        <Column className="dendrite-side">
          <Inputs declarations={declarations} />
          <Outputs declarations={declarations} />
          <Diagnostics />
        </Column>
      </Row>
    </Column>
  );
}
