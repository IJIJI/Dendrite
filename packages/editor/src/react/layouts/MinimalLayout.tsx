import { Actions, defaultActions } from "../blocks/Actions";
import { Inputs } from "../blocks/panes/Inputs";
import { Outputs } from "../blocks/panes/Outputs";
import { TopBar } from "../blocks/TopBar";
import { cx } from "../cx";
import { CodeBlock } from "./CodeBlock";
import { Column, type LayoutConfig, Row } from "./Layout";
import { barItems, placeActions } from "./placement";

//? <Editor.MinimalLayout/>: a program in a page - the inputs in one line above, the code,
// the outputs as lines below, the actions at the end of the input strip. The bottom of the
// scale (Minimal · Compact · Full): no gutter, no declaration affordances, no Diagnostics
// pane - a problem shows as a squiggle with its message on hover. The height follows the
// content. Editable like every preset; a documented example passes `code={{ editable: false }}`.
// A program with no inputs shows no input pane (style.css hides the empty one); the strip
// stays when the actions live in it.

export type MinimalSpot = "inputs" | "code-start" | "code-end" | "bar-start" | "bar-end";

export interface MinimalLayoutProps extends LayoutConfig<MinimalSpot> {
  /**
   * The inputs as a grid of `$name = [field]` cells wrapping into rows (`row`, the default;
   * cells at least `--dendrite-inline-min` wide), or as the pane's stacked rows (`column`).
   */
  inputs?: "row" | "column";
}

export function MinimalLayout({
  code,
  declarations = false,
  actions = defaultActions,
  actionsAt = "inputs",
  topBar,
  inputs = "row",
  className,
  style,
}: MinimalLayoutProps) {
  const spot = placeActions(actionsAt, topBar, "inputs");
  const pane = (
    <Inputs
      title={null}
      declarations={declarations}
      className={inputs === "row" ? "dendrite-inputs-inline" : undefined}
    />
  );
  return (
    <Column className={cx("dendrite-minimal-layout", className)} style={style}>
      {topBar ? <TopBar {...topBar} {...barItems(topBar, spot, actions)} /> : null}
      {spot === "inputs" ? (
        <Row className="dendrite-minimal-strip">
          {pane}
          {actions.length > 0 ? <Actions items={actions} /> : null}
        </Row>
      ) : (
        pane
      )}
      <CodeBlock code={code} gutters="none" spot={spot} actions={actions} />
      <Outputs title={null} declarations={declarations} className="dendrite-outputs-lines" />
    </Column>
  );
}
