import { type CSSProperties } from "react";

import { Canvas } from "./Canvas";
import { cx } from "./cx";
import { Diagnostics } from "./Diagnostics";
import { Inputs } from "./Inputs";
import { Column, Row } from "./Layout";
import { Outputs } from "./Outputs";
import { TopBar, type TopBarProps } from "./TopBar";

//? <Editor.DefaultLayout/>: the playground arrangement as a preset - top bar, canvas on the
// left, the three panes stacked on the right. A preset is just a composition of the same
// pieces a host can arrange itself.

export interface DefaultLayoutProps {
  /** Rendered when given; omit for no top bar. */
  topBar?: TopBarProps;
  className?: string;
  style?: CSSProperties;
}

export function DefaultLayout({ topBar, className, style }: DefaultLayoutProps) {
  return (
    <Column grow className={cx("dendrite-default-layout", className)} style={style}>
      {topBar ? <TopBar {...topBar} /> : null}
      <Row grow>
        <Column grow>
          <Canvas />
        </Column>
        <Column className="dendrite-side">
          <Inputs />
          <Outputs />
          <Diagnostics />
        </Column>
      </Row>
    </Column>
  );
}
