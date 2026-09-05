import { type ReactNode } from "react";

//? A handful of inline icons. Geometry is Lucide's (ISC, lucide.dev) drawn the brand's way:
// square caps and miter joins so the set shares the mark's corners; 20px / stroke 1.75 in
// controls, 16px / 1.5 inline (style.css). Kept in-package deliberately: an icon library is a
// dependency the handful does not yet justify.

export type IconName =
  | "share"
  | "history"
  | "code"
  | "graph"
  | "chevron"
  | "chevron-down"
  | "undo"
  | "redo";

const glyphs: Record<IconName, ReactNode> = {
  // undo-2 / redo-2
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" />
    </>
  ),
  share: (
    <>
      <path d="M12 2v13" />
      <path d="m16 6-4-4-4 4" />
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </>
  ),
  code: (
    <>
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </>
  ),
  // git-fork: the graph view, and a nod to the mark
  graph: (
    <>
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" />
      <path d="M12 12v3" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="dendrite-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {glyphs[name]}
    </svg>
  );
}
