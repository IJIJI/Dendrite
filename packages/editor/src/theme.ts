import { createSubject, type Observable } from "./observable";

//? The colour scheme. "auto" follows the system (style.css resolves its light-dark() pairs
// from color-scheme); "light" / "dark" force one through the data-dendrite-theme attribute on
// <html>. One page has one theme, so the page controller is a lazy singleton (getTheme()). The
// preference lives in localStorage so a reload keeps it - the one thing the editor persists on
// its own, because it is a UI preference, not document data. A host with its own theme setting
// never calls this: it writes the attribute itself and hides the toggle
// (<Editor.TopBar themeToggle={false}/>), and nothing is stored on its behalf.

export type ThemeMode = "auto" | "light" | "dark";

export interface ThemeController {
  /** The current mode; subscribe to follow the toggle. */
  readonly mode: Observable<ThemeMode>;
  /** Apply a mode to the page and remember it. */
  set(mode: ThemeMode): void;
}

/** Set on <html>: "light" | "dark"; absent = follow the system. */
export const THEME_ATTRIBUTE = "data-dendrite-theme";
export const THEME_STORAGE_KEY = "dendrite:theme";

const MODES: readonly ThemeMode[] = ["auto", "light", "dark"];
const isMode = (value: unknown): value is ThemeMode => MODES.includes(value as ThemeMode);

/** The mode after `mode` in the toggle's cycle: auto → light → dark → auto. */
export const nextThemeMode = (mode: ThemeMode): ThemeMode =>
  MODES[(MODES.indexOf(mode) + 1) % MODES.length]!;

/** Where a controller reads and writes: the page by default; tests pass fakes. */
export interface ThemeTarget {
  root?: Pick<Element, "getAttribute" | "setAttribute" | "removeAttribute">;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

// localStorage can throw on mere access (privacy modes, sandboxed frames): treat it as absent.
function pageStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const pageTarget = (): ThemeTarget => ({
  root: typeof document === "undefined" ? undefined : document.documentElement,
  storage: pageStorage(),
});

export function createThemeController(target: ThemeTarget = pageTarget()): ThemeController {
  // Stored preference first; else an attribute the host already put on the page; else auto.
  const initial = (): ThemeMode => {
    try {
      const stored = target.storage?.getItem(THEME_STORAGE_KEY);
      if (isMode(stored)) return stored;
    } catch {
      // unreadable storage - fall through
    }
    const present = target.root?.getAttribute(THEME_ATTRIBUTE);
    return isMode(present) ? present : "auto";
  };
  const applyToPage = (mode: ThemeMode): void => {
    if (mode === "auto") target.root?.removeAttribute(THEME_ATTRIBUTE);
    else target.root?.setAttribute(THEME_ATTRIBUTE, mode);
  };
  const remember = (mode: ThemeMode): void => {
    try {
      if (mode === "auto") target.storage?.removeItem(THEME_STORAGE_KEY);
      else target.storage?.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // storage full or forbidden: the page still switches, it just will not remember
    }
  };

  const mode$ = createSubject<ThemeMode>(initial());
  applyToPage(mode$.get());
  return {
    mode: mode$,
    set(mode) {
      applyToPage(mode);
      remember(mode);
      mode$.set(mode);
    },
  };
}

let page: ThemeController | undefined;

/**
 * The page's theme controller, created on first call (which also applies the remembered
 * preference). Call it once before the first render so a remembered "dark" never flashes light.
 */
export function getTheme(): ThemeController {
  return (page ??= createThemeController());
}
