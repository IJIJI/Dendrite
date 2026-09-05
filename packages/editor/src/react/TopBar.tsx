import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import { cx } from "./cx";
import { Icon, type IconName } from "./icons";

//? <Editor.TopBar/>: brand · menus · centred title · actions. Menus and actions are DATA a
// host supplies, so every host gets the same look and keyboard behaviour (Command pattern
// in its simplest form); anything with its own UI drops in as an `element`. The editor
// appends its own items (editor switch, history) as those features arrive.

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
