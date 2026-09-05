# Dendrite brand — handoff

Brand system for **Dendrite**, a declarative dataflow language with incremental reactive evaluation, embeddable in TypeScript. This folder is self-sufficient: tokens, vector assets, terminal art, README header, and a standalone brand sheet.

## About these files
- `brand-sheet.html` is a **design reference** (self-contained HTML, opens offline). It is regenerated from the tokens and weighs 1 MB, so it is kept out of git with the brand source. Recreate what it shows in the target codebase using its own stack; do not ship the HTML.
- `assets/*.svg` are **production vectors**: outlined paths, no font dependency, safe to use as-is (web, print, favicons). Only the two OG images and the banner contain `<text>` and expect Chakra Petch / Archivo to be available.
- `dendrite-tokens.css` is the **source of truth** for every colour, font, radius, motion and spacing value. Import it; never hard-code a hex.
- `ascii.txt` — the terminal marks, plain text.
- `README-header.md` — banner + shields.io badge snippet for the repository README.

Fidelity: **high**. Values below are final.

---

## 1. The mark

The capital **D of Chakra Petch 600** with a **fork** laid over it. The fork starts at the D's outer left edge, runs horizontally into the counter at half cap height, and splits into two 45° arms. A **gap** knocked out of the D isolates the fork on all sides.

Geometry in per-mille of the em (SVG user units in `assets/`; baseline y = 0, up is negative):

| Measure | Value | Rule |
|---|---|---|
| Cap height | 700 | glyph as drawn |
| Stem width | 115.6 (x 70 → 185.6) | glyph as drawn |
| Counter | x 185.6 → 504.4 (318.8 wide) | glyph as drawn |
| Fork weight | 95.6 | = min(stem, 30% of counter) |
| Fork centreline | y = −350 | −cap / 2 |
| Fork start | x = 70 | the D's outer left edge |
| Split point | x = 255.7 | counter left + 22% of counter width |
| Arm length | 127.5 (to x 383.3) | min(40% counter, cap/2 − 0.6·fork) at 45° |
| Gap | 43.0 each side | 45% of fork weight; stroke = 181.7 in the mask |
| Caps / joins | butt / miter | never round |
| Clear space | 1 stem (115.6) | already included in every SVG viewBox |
| Minimum size | 16 px tall | below 24 px prefer the avatar (reversed on Iris) |

Paths (reuse verbatim):
```
D:    M70 -700L503.3 -700L620 -583.3L620 -116.7L503.3 0L70 0ZM185.6 -600L185.6 -100L447.8 -100L504.4 -156.7L504.4 -543.3L447.8 -600Z
Fork: M70 -350H255.7L383.3 -477.5M255.7 -350L383.3 -222.5
```
Construction: `mask` = white rect minus Fork stroked at 181.7; draw D filled with the mask; draw Fork stroked at 95.6 in the accent. The fork is always **above** the D.

Do not: rotate, stretch, drop the gap, add shadows or outlines, redraw the fork from the stem centre, or place on gradients / busy fields.

## 2. Lockups
- **Symbol** (default): `dendrite-mark*.svg`.
- **Wordmark**: the symbol is the D of "Dendrite"; the remaining letters are Chakra Petch 600 outlines (`dendrite-wordmark*.svg`). Never set the wordmark in live text with a separate symbol beside it.
- **Stacked**: symbol large, wordmark at 1.4× the D's width beneath, gap 1.2 stems (`dendrite-stacked*.svg`). For squares and swag.

## 3. Colour
Light theme: D in **ink**, fork in **Iris**. Dark theme: D in **ground**, fork in Iris (default) or **Periwinkle** where contrast matters (small sizes, video). One-colour fallbacks: all-ink, all-Iris, reversed (white on Iris, used for favicon/avatar).

Core:
```
ink        #201e1d     ground     #f3f2f2
iris       #6366f1     periwinkle #7c83f5   (accent on dark)
white      #ffffff
```
Surface levels (light → dark): ground `#f3f2f2`, ground-1 `#ffffff`, ground-2 `#e6e4e3`; dark-0 `#141312`, dark-1 `#201e1d`, dark-2 `#2c2a29`.
Text: ink `#201e1d`, ink-2 `#5c5856`, ink-3 `#8a8583` (placeholders/disabled only); dark-ink `#f3f2f2`, dark-ink-2 `#a8a4a2`, dark-ink-3 `#7d7977`.
Borders: `#cfcccb` light, `#3a3735` dark.
Iris ramp 100–900, statuses (ok / warn / error / info / cached / stale, each with a `-soft` fill, light and dark), and the syntax tokens are in `dendrite-tokens.css` (OKLCH). Dark-theme values sit under `@media (prefers-color-scheme: dark)`.

**Editor surfaces** (`--dn-editor-*`, tokens 1.1): three levels with 1px rules — bar ground-2, page ground, canvas ground-1; on dark one step up the ramp, dark-0 / dark-1 / dark-2, because dark-0 under a full screen of near-white text read as harsh. Selection is iris-200 (iris-900 on dark); the active line is a 6 % ink veil.

**Syntax** (tokens 1.1, as the editor ships it): keywords magenta at weight 600, ops (`Filter`, `Map`) iris, declared names ink, `$inputs` and `true / false / null` orange, strings green, numbers amber, operators (`=> = >=`) blue, punctuation ink-3, comments ink-2 italic. Every hue sits at text-level contrast on both canvases.

Contrast: ink/ground 14.6:1; iris/ground 4.4:1 (UI and ≥20 px text; use `--dn-iris-ink` for paragraph-size accent text); white/iris 4.5:1; periwinkle/dark-0 6.9:1. Status is never conveyed by colour alone — always a glyph (✓ ✗ · ◌) or a word. Status tags set their word in ink on the soft fill with a 6px dot in the base colour: the sheet's base-on-soft text is below AA by its own table.

## 4. Type
- **Display**: Chakra Petch 600 — wordmark, Display/H1/H2 only. Stops at H2.
- **Body**: Archivo 400/600 — H3 and below, prose (max 64ch), UI.
- **Code**: IBM Plex Mono 400 — code blocks, editor. Inline code 0.9em on ground-2.
- **CLI / labels**: Kode Mono 500 — terminal output, node labels, badges, secondary UI text.

Scale (size / line-height): Display 56/1.0 · H1 40/1.1 · H2 28/1.15 · H3 20/1.3 · H4 16/1.4 · Body 16/1.6 · Body-s 14/1.5 · Caption 12/1.5 · Code 14/1.65 · CLI 13/1.4 · Overline 11/1.3, .08em, caps. Tabular figures for all numbers in tables and CLI. Letter-spacing normal except the overline. Sentence case everywhere.

## 5. Interface rules
- **Radius**: 0 everywhere; 2px on inputs, tags and code wells; 999px only for status dots and counters.
- **Borders**: 1px `#cfcccb` between rows and around cards; **2px ink** rules between major sections and under table headers, full content width. No hairlines under 1px, no shadows. Elevation is expressed with surface level and border, never shadow.
- **Spacing**: 4px scale. 8/12 inside controls, 16/24 inside cards, 32/48 between sections, 64 between page blocks.
- **Layout**: content max 1280; docs = nav 240 + content (prose 64ch) + toc 200 at ≥1280; marketing = 12 cols, 24px gutter. Breakpoints 640 / 960 / 1280.
- **States**: hover = one ramp step darker (120 ms); active = two steps; focus = 2px Iris outline, 2px offset, on every interactive element (`:focus-visible` only); disabled = 45% opacity, no colour change; loading = 10px ring replaces the leading icon, width unchanged.
- **Motion**: only fills/borders, panel open (200 ms, opacity + 4px translate), tab underline, and the **recompute pulse** (Iris sweeps left→right along a node in 200 ms, fades 200 ms). Easing `cubic-bezier(.2,0,0,1)`. Nothing scales, bounces, rotates or loops. `prefers-reduced-motion` → 0 ms, pulse becomes an instant fill change.
- **Icons**: Lucide, 24-unit grid, drawn with `stroke-linecap: square; stroke-linejoin: miter`. 16/1.5 inline, 20/1.75 controls, 24/2 headers. Ink or ink-2; Iris only when the icon is the action.
- **Diagrams**: nodes are 28px boxes, radius 0, 1px border, mono label left-aligned. Inputs carry a 3px Iris bar on the **left** edge, outputs on the **right** edge. Edges 1.5px ink, orthogonal with one midpoint bend, filled triangular head, left→right. Node state shown by fill only (cached purple-soft, stale amber-soft, error red-soft).
- **Imagery**: none. No photography, no illustration, no mascots. Diagrams, code and the mark are the imagery. Screenshots at 1×/2× with a 1px border, no frames or shadows.

## 6. Voice and naming
Precise, plain, helpful at the point of failure. Second person, present tense, digits for all numbers, no hype words (simply, just, powerful, seamless, blazing). Errors: what · where · likely fix, one line each.

Fixed vocabulary: **Dendrite** (project, prose) · **dendrite** (package, CLI, org) · **.den** (file extension) · graph / node / edge · input (`$name`) / output (`output name`) · fresh / cached / stale · recompute · embed · `v0.1.0` in prose and badges, bare in CLI and package.json.

## 7. Terminal
See `ascii.txt`. Prefix `▌▶` in the accent, one space after. Block art uses only Block Elements and box drawing; render in a monospace that covers U+2580–259F (Menlo, DejaVu Sans Mono, Cascadia, Consolas — Kode Mono and Plex Mono do not). Accent = ANSI 105 on dark, 99 on light; bold when colour is off. Status glyphs ✓ ✗ · and a wavy underline; no emoji; under 80 columns.

## 8. Applications
- Favicon 16/32/64 and social avatars: `dendrite-avatar-square.svg` / `-circle.svg` (white mark on Iris).
- Sticker: `dendrite-sticker.svg` (die-cut, white border 0.9 stem).
- README: `dendrite-banner-light.svg` + badges from `README-header.md` (ink label, Iris value, `style=flat-square`).
- Social/OG 1200×630: `dendrite-og-light.svg`, `dendrite-og-dark.svg`.
- PNG exports at 16/64/256/1024 can be rendered from the SVGs (they are pure vector); the brand sheet's Files section also offers them.

## 9. Legal
Code MPL-2.0 (the repository `LICENSE`); brand assets are not covered by the code licence — free to use unaltered to refer to Dendrite, not to modify, use as another app's icon, or combine into a new lockup. Trademark line and contact are placeholders in the sheet (`[owner]`, repo issues with the `brand` label).

## Files
```
dendrite-brand/
  README.md                  this file
  brand-sheet.html           standalone brand sheet (design reference; not in git)
  dendrite-tokens.css        all tokens, light + dark
  ascii.txt                  terminal marks
  README-header.md           repo README banner + badges
  assets/                    16 SVGs (mark ×6, wordmark ×2, stacked ×2, avatar ×2, sticker, banner, og ×2)
```
Tokens 1.1 · September 2026 (editor sync, see the changelog in `dendrite-tokens.css`). The sheet was patched to 1.1 by script (palette, contrast rows, status tags, code samples, syntax cards, version); the Claude Design canvas it was exported from still holds 1.0, so apply the tokens there before the next export.
