import { type CodeOptions } from "../../code/cm";
import { Actions, type TopBarItem } from "../blocks/Actions";
import { Canvas } from "../blocks/Canvas";
import { cx } from "../cx";
import { type ActionsPlacement } from "./placement";

//? The code block every preset has: the canvas, and the actions cluster floating in its
// corner when the spot is a code one. Internal to the layouts.

export function CodeBlock({
  code,
  gutters,
  spot,
  actions,
  className,
}: {
  code: CodeOptions | undefined;
  gutters: CodeOptions["gutters"];
  spot: ActionsPlacement;
  actions: readonly TopBarItem[];
  className?: string;
}) {
  const corner = spot === "code-start" || spot === "code-end";
  return (
    <div className={cx("dendrite-code", className)}>
      <Canvas gutters={gutters} {...code} />
      {corner && actions.length > 0 ? (
        <Actions
          items={actions}
          className={`dendrite-actions-${spot === "code-start" ? "start" : "end"}`}
        />
      ) : null}
    </div>
  );
}
