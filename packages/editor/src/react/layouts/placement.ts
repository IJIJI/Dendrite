import { type TopBarItem } from "../blocks/Actions";
import { type TopBarProps } from "../blocks/TopBar";

//? Where a layout's actions cluster renders, resolved the same way by every preset. A spot
// names a region - the bar's start or end, the code's start or end (floating), the top of
// the side column, the input strip - and each preset supports its own subset with its own
// default. Pure, so the rule is one place and testable without React.

export type ActionsPlacement =
  | "bar-start"
  | "bar-end"
  | "code-start"
  | "code-end"
  | "side"
  | "inputs";

const isBar = (at: ActionsPlacement): at is "bar-start" | "bar-end" => at.startsWith("bar-");

/** The spot that actually renders: a bar spot needs a bar, else the preset's fallback. */
export function placeActions<At extends ActionsPlacement>(
  at: At,
  topBar: TopBarProps | undefined,
  fallback: Exclude<At, "bar-start" | "bar-end">,
): At {
  return isBar(at) && !topBar ? fallback : at;
}

/**
 * The bar's two clusters: the host's own items as given, with the actions appended to the
 * cluster the spot names. A cluster the host did not set stays empty - the bar's standalone
 * default (the editor's own controls) is for a bar a host renders by itself, never for a
 * layout, which puts those controls where its spot says.
 */
export function barItems(
  topBar: TopBarProps,
  spot: ActionsPlacement,
  actions: readonly TopBarItem[],
): { start: readonly TopBarItem[]; end: readonly TopBarItem[] } {
  const start = topBar.start ?? [];
  const end = topBar.end ?? [];
  return {
    start: spot === "bar-start" ? [...start, ...actions] : start,
    end: spot === "bar-end" ? [...end, ...actions] : end,
  };
}
