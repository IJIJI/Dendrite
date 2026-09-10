import { Actions, defaultActions } from "../blocks/Actions";
import { Diagnostics } from "../blocks/panes/Diagnostics";
import { Inputs } from "../blocks/panes/Inputs";
import { Outputs } from "../blocks/panes/Outputs";
import { TopBar } from "../blocks/TopBar";
import { cx } from "../cx";
import { CodeBlock } from "./CodeBlock";
import { Column, type LayoutConfig, Row } from "./Layout";
import { barItems, placeActions } from "./placement";

//? <Editor.FullLayout/>: the playground arrangement as a preset - top bar, canvas on the
// left, the three panes stacked on the right, the actions at the bar's end. The top of the
// scale (Minimal · Compact · Full): every gutter, every declaration affordance, an open
// Diagnostics pane. A preset is just a composition of the same pieces a host can arrange
// itself.

export type FullSpot = "bar-end" | "bar-start" | "code-start" | "code-end" | "side";

export type FullLayoutProps = LayoutConfig<FullSpot>;

export function FullLayout({
  code,
  declarations = true,
  actions = defaultActions,
  actionsAt = "bar-end",
  topBar,
  className,
  style,
}: FullLayoutProps) {
  const spot = placeActions(actionsAt, topBar, "code-end");
  return (
    <Column grow className={cx("dendrite-full-layout", className)} style={style}>
      {topBar ? <TopBar {...topBar} {...barItems(topBar, spot, actions)} /> : null}
      <Row grow>
        <CodeBlock
          code={code}
          gutters="full"
          spot={spot}
          actions={actions}
          className="dendrite-grow"
        />
        <Column className="dendrite-side">
          {spot === "side" && actions.length > 0 ? (
            <div className="dendrite-side-actions">
              <Actions items={actions} />
            </div>
          ) : null}
          <Inputs declarations={declarations} />
          <Outputs declarations={declarations} />
          <Diagnostics />
        </Column>
      </Row>
    </Column>
  );
}
