import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import { type EditorHandle } from "../editor";
import { useOptionalEditor } from "./context";
import { cx } from "./cx";
import { useObservable } from "./hooks";
import { Icon, type IconName } from "./icons";

//? <Editor.TopBar/>: brand · menus · centred title · actions. Menus and actions are DATA a
// host supplies, so every host gets the same look and keyboard behaviour (Command pattern
// in its simplest form); anything with its own UI drops in as an `element`. Inside <Editor>
// the bar also carries the editor's OWN actions (undo/redo today; editor switch, history
// later) ahead of the host's - outside one it simply renders what it is given.

export interface MenuItem {
  label: string;
  onSelect?(): void;
  /** One level of submenu (e.g. File ▸ Load example ▸ …). */
  items?: MenuItem[];
  disabled?: boolean;
}

export interface Menu {
  label: string;
  items: MenuItem[];
}

export type TopBarAction =
  | { icon: IconName; label: string; onClick(): void; disabled?: boolean }
  | { element: ReactNode };

export interface TopBarProps {
  /** Centred document title. */
  title?: string;
  /** Replaces the "Dendrite" wordmark (a logo, later). */
  brand?: ReactNode;
  menus?: Menu[];
  actions?: TopBarAction[];
  className?: string;
  style?: CSSProperties;
}

export function TopBar({
  title,
  brand = "Dendrite",
  menus = [],
  actions = [],
  className,
  style,
}: TopBarProps) {
  const editor = useOptionalEditor();
  return (
    <header className={cx("dendrite-topbar", className)} style={style}>
      <div className="dendrite-topbar-left">
        <span className="dendrite-brand">{brand}</span>
        {menus.length > 0 ? <MenuBar menus={menus} /> : null}
      </div>
      <div className="dendrite-topbar-title" title={title}>
        {title}
      </div>
      <div className="dendrite-topbar-actions">
        {editor ? <HistoryActions editor={editor} /> : null}
        {editor && actions.length > 0 ? <span className="dendrite-topbar-sep" /> : null}
        {actions.map((action, i) =>
          "element" in action ? (
            <span key={i} className="dendrite-topbar-action">
              {action.element}
            </span>
          ) : (
            <button
              key={i}
              type="button"
              className="dendrite-icon-button"
              title={action.label}
              aria-label={action.label}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              <Icon name={action.icon} />
            </button>
          ),
        )}
      </div>
    </header>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const shortcut = { undo: isMac ? "⌘Z" : "Ctrl+Z", redo: isMac ? "⇧⌘Z" : "Ctrl+Y" };

// The editor's own actions: undo/redo over the source history, disabled at depth 0.
function HistoryActions({ editor }: { editor: EditorHandle }) {
  const depth = useObservable(editor.history);
  return (
    <>
      <button
        type="button"
        className="dendrite-icon-button"
        title={`Undo (${shortcut.undo})`}
        aria-label="Undo"
        disabled={depth.undo === 0}
        onClick={editor.undo}
      >
        <Icon name="undo" />
      </button>
      <button
        type="button"
        className="dendrite-icon-button"
        title={`Redo (${shortcut.redo})`}
        aria-label="Redo"
        disabled={depth.redo === 0}
        onClick={editor.redo}
      >
        <Icon name="redo" />
      </button>
    </>
  );
}

// One menu open at a time; hovering another button while one is open switches (the desktop
// convention). Escape or a click outside closes. Submenus open on hover/focus via CSS.
function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLElement>(null);

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

  return (
    <nav ref={ref} className="dendrite-menubar" role="menubar" aria-label="Editor menu">
      {menus.map((menu, i) => (
        <div key={menu.label} className="dendrite-menu">
          <button
            type="button"
            className="dendrite-menu-button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => {
              if (open !== null && open !== i) setOpen(i);
            }}
          >
            {menu.label}
          </button>
          {open === i ? <MenuList items={menu.items} onClose={() => setOpen(null)} /> : null}
        </div>
      ))}
    </nav>
  );
}

function MenuList({
  items,
  onClose,
  submenu = false,
}: {
  items: MenuItem[];
  onClose(): void;
  submenu?: boolean;
}) {
  return (
    <ul className={cx("dendrite-menu-list", submenu && "dendrite-submenu")} role="menu">
      {items.map((item, i) => (
        <li key={i} className="dendrite-menu-item" role="none">
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            aria-haspopup={item.items ? "menu" : undefined}
            onClick={() => {
              if (item.items) return; // a parent item only reveals its submenu
              item.onSelect?.();
              onClose();
            }}
          >
            <span>{item.label}</span>
            {item.items ? <Icon name="chevron" /> : null}
          </button>
          {item.items ? <MenuList items={item.items} onClose={onClose} submenu /> : null}
        </li>
      ))}
    </ul>
  );
}
