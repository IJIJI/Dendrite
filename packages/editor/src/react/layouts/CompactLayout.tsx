import { Actions, defaultActions } from "../blocks/Actions";
import { Diagnostics } from "../blocks/panes/Diagnostics";
import { Inputs } from "../blocks/panes/Inputs";
import { Outputs } from "../blocks/panes/Outputs";
import { TopBar } from "../blocks/TopBar";
import { cx } from "../cx";
import { CodeBlock } from "./CodeBlock";
import { Column, type LayoutConfig, Row } from "./Layout";
import { barItems, placeActions } from "./placement";

//? <Editor.CompactLayout/>: the code with the inputs and outputs beside it when there is
// room and below it when there is not (a flex wrap, no media query), the actions in a strip
// at the top of the side, and Diagnostics collapsed to one line that counts the problems.
// The middle of the scale (Minimal · Compact · Full): lint dots but no line numbers, the
// declaration affordances where the layer allows them. The code follows its content up
// to --dendrite-compact-max-height, then scrolls.

export type CompactSpot = "side" | "code-start" | "code-end" | "bar-start" | "bar-end";

export type CompactLayoutProps = LayoutConfig<CompactSpot>;

export function CompactLayout({
  code,
  declarations = true,
  actions = defaultActions,
  actionsAt = "side",
  topBar,
  className,
  style,
}: CompactLayoutProps) {
  const spot = placeActions(actionsAt, topBar, "side");
  return (
    <Column className={cx("dendrite-compact-layout", className)} style={style}>
      {topBar ? <TopBar {...topBar} {...barItems(topBar, spot, actions)} /> : null}
      <Row className="dendrite-compact-body">
        <CodeBlock code={code} gutters="compact" spot={spot} actions={actions} />
        <Column className="dendrite-compact-side">
          {spot === "side" && actions.length > 0 ? (
            <div className="dendrite-side-actions">
              <Actions items={actions} />
            </div>
          ) : null}
          <Inputs declarations={declarations} />
          <Outputs declarations={declarations} />
        </Column>
      </Row>
      <Diagnostics collapsible />
    </Column>
  );
}
