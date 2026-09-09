import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { type EditorHandle } from "../../session/editor";
import { getTheme, nextThemeMode, type ThemeMode } from "../../theme";
import { useOptionalEditor } from "../context";
import { cx } from "../cx";
import { useObservable } from "../hooks";
import { Icon, type IconName } from "../icons";

//? <Editor.Actions/>: a cluster of items - the top bar's two sides, or the corner of a code
// block in a layout without a bar. Items are DATA a host supplies (Command pattern in its
// simplest form): a dropdown menu, an icon action, an element of the host's own, or one of
// the editor's built-ins (undo, redo, the theme toggle) listed by name so a host puts them
// where it wants or leaves them out. Listing replaces: an item that is not in the list is
// not there. Undo and redo render only inside an <Editor> whose code is editable.

export interface MenuItem {
  label: string;
  onSelect?(): void;
  /** One level of submenu (e.g. File ▸ Load example ▸ …). */
  items?: MenuItem[];
  disabled?: boolean;
}

/** A dropdown: a labelled button opening a list. */
export interface Menu {
  label: string;
  items: MenuItem[];
}

/** An icon button, or an element with its own UI. */
export type TopBarAction =
  | { icon: IconName; label: string; onClick(): void; disabled?: boolean }
  | { element: ReactNode };

/** One of the editor's own controls. */
export interface BuiltIn {
  item: "undo" | "redo" | "theme";
}

export type TopBarItem = Menu | TopBarAction | BuiltIn;

/** The built-ins, to list where a host wants them: `end: [items.undo, items.redo, share]`. */
export const items = {
  undo: { item: "undo" },
  redo: { item: "redo" },
  theme: { item: "theme" },
} as const satisfies Record<string, BuiltIn>;

/** What a cluster shows when a host lists nothing: the editor's own controls. */
export const defaultEnd: readonly TopBarItem[] = [items.undo, items.redo, items.theme];

export interface ActionsProps {
  items?: readonly TopBarItem[];
  className?: string;
  style?: CSSProperties;
}

const isBuiltIn = (item: TopBarItem): item is BuiltIn => "item" in item;
const isMenu = (item: TopBarItem): item is Menu => "items" in item;

export function Actions({ items: list = defaultEnd, className, style }: ActionsProps) {
  const editor = useOptionalEditor();
  const ref = useRef<HTMLDivElement>(null);
  // One menu open at a time; hovering another while one is open switches (the desktop
  // convention). Escape or a click outside closes.
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // In a code block's corner the cluster floats over the text; tell the code how wide it is
  // (cm.ts reads the variable) so the first line stays clear of it.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent?.classList.contains("dendrite-code")) return;
    parent.style.setProperty("--dendrite-code-inset-right", `${el.offsetWidth + 8}px`);
    return () => {
      parent.style.removeProperty("--dendrite-code-inset-right");
    };
  });

  return (
    <div ref={ref} className={cx("dendrite-actions", className)} style={style}>
      {list.map((item, i) => (
        <Item
          key={i}
          item={item}
          editor={editor}
          // A divider where the editor's own controls end and the host's begin.
          divided={i > 0 && isBuiltIn(list[i - 1]!) && !isBuiltIn(item)}
          open={open === i}
          onOpen={(next) => setOpen(next ? i : null)}
          onHover={() => {
            if (open !== null && open !== i) setOpen(i);
          }}
        />
      ))}
    </div>
  );
}

function Item({
  item,
  editor,
  divided,
  open,
  onOpen,
  onHover,
}: {
  item: TopBarItem;
  editor: EditorHandle | null;
  divided: boolean;
  open: boolean;
  onOpen(open: boolean): void;
  onHover(): void;
}) {
  const rendered = isBuiltIn(item) ? (
    <BuiltInControl name={item.item} editor={editor} />
  ) : isMenu(item) ? (
    <MenuButton menu={item} open={open} onOpen={onOpen} onHover={onHover} />
  ) : "element" in item ? (
    <span className="dendrite-topbar-action">{item.element}</span>
  ) : (
    <button
      type="button"
      className="dendrite-icon-button"
      title={item.label}
      aria-label={item.label}
      disabled={item.disabled}
      onClick={item.onClick}
    >
      <Icon name={item.icon} />
    </button>
  );
  if (rendered === null) return null;
  return (
    <>
      {divided ? <span className="dendrite-topbar-sep" /> : null}
      {rendered}
    </>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const shortcut = { undo: isMac ? "⌘Z" : "Ctrl+Z", redo: isMac ? "⇧⌘Z" : "Ctrl+Y" };

function BuiltInControl({ name, editor }: { name: BuiltIn["item"]; editor: EditorHandle | null }) {
  if (name === "theme") return <ThemeToggle />;
  if (!editor?.editable) return null;
  return <HistoryButton which={name} editor={editor} />;
}

// Undo / redo over the source history, disabled at depth 0.
function HistoryButton({ which, editor }: { which: "undo" | "redo"; editor: EditorHandle }) {
  const depth = useObservable(editor.history);
  const label = which === "undo" ? "Undo" : "Redo";
  return (
    <button
      type="button"
      className="dendrite-icon-button"
      title={`${label} (${shortcut[which]})`}
      aria-label={label}
      disabled={depth[which] === 0}
      onClick={editor[which]}
    >
      <Icon name={which} />
    </button>
  );
}

const themeName: Record<ThemeMode, string> = { auto: "system", light: "light", dark: "dark" };
const themeIcon: Record<ThemeMode, IconName> = { auto: "monitor", light: "sun", dark: "moon" };

// One button cycling system → light → dark; the page controller does the applying and remembering.
function ThemeToggle() {
  const theme = getTheme();
  const mode = useObservable(theme.mode);
  const next = nextThemeMode(mode);
  return (
    <button
      type="button"
      className="dendrite-icon-button"
      title={`Theme: ${themeName[mode]} (next: ${themeName[next]})`}
      aria-label={`Theme: ${themeName[mode]}`}
      onClick={() => theme.set(next)}
    >
      <Icon name={themeIcon[mode]} />
    </button>
  );
}

// The menu-button pattern: a button with aria-haspopup owning a popup list. Submenus open
// on hover/focus via CSS.
function MenuButton({
  menu,
  open,
  onOpen,
  onHover,
}: {
  menu: Menu;
  open: boolean;
  onOpen(open: boolean): void;
  onHover(): void;
}) {
  return (
    <div className="dendrite-menu">
      <button
        type="button"
        className="dendrite-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpen(!open)}
        onMouseEnter={onHover}
      >
        {menu.label}
        <Icon name="chevron-down" />
      </button>
      {open ? <MenuList items={menu.items} onClose={() => onOpen(false)} /> : null}
    </div>
  );
}

function MenuList({
  items: entries,
  onClose,
  submenu = false,
}: {
  items: MenuItem[];
  onClose(): void;
  submenu?: boolean;
}) {
  return (
    <ul className={cx("dendrite-menu-list", submenu && "dendrite-submenu")} role="menu">
      {entries.map((entry, i) => (
        <li key={i} className="dendrite-menu-item" role="none">
          <button
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            aria-haspopup={entry.items ? "menu" : undefined}
            onClick={() => {
              if (entry.items) return; // a parent item only reveals its submenu
              entry.onSelect?.();
              onClose();
            }}
          >
            <span>{entry.label}</span>
            {entry.items ? <Icon name="chevron" /> : null}
          </button>
          {entry.items ? <MenuList items={entry.items} onClose={onClose} submenu /> : null}
        </li>
      ))}
    </ul>
  );
}
