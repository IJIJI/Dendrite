# CHANGES — brand round 2 (October 2026)

Apply to the `brand/` folder (same layout as this package). Files are based on your current `brand/` (tokens 1.1 with editor surfaces, MPL-2.0 README); nothing from round 1 or the editor sync changes; this round adds the aurora system, an icon set, and the docs-landing hero. All colours are existing tokens.

## Decisions
- **Aurora**: `warp` field is **primary** (contour rings warped by noise). `dune` and `marble` are approved alternatives for future use; do not mix fields on one page.
- **Docs landing**: implement hero option **5z** (aurora behind the hero band, fading to dark-0; headline left, code well right). Pillar treatments with live examples are future expansions, not in this round.
- **Icons**: add **D3** (dark-0 rounded square, dim aurora glow, ground D, Periwinkle fork) alongside the existing A (plain dark-0) and the reversed-on-Iris avatar. Use D3 for social avatars; keep A for the browser favicon and the reversed avatar for 16 px.
- **Swag** and **MinimalLayout** editor: still TBD, nothing to implement.

## Updated files
- `brand-sheet.html` — rebuilt from source; adds §22 Aurora, §23 Icons, §24 Docs landing (5z, with layout rules) and §25 Editor surfaces; Legal/Files renumbered to 26/27, version 1.2. The 1.1 editor-sync patch (syntax cards incl. `--dn-code-operator`, code-sample colours, editor-surfaces note) is now in the source, not a post-export script.
- `dendrite-tokens.css` — aurora tokens + changelog 1.2, on top of your 1.1 (editor sync).
- `README.md` — §9 Aurora, §10 Icons, file list, version 1.1.
- `README-header.md` — social-preview note.
- `ascii.txt` — note that there is no ASCII aurora this round.

## New files
```
aurora/
  aurora.ts     field generator + marching-squares isolines + SVG serialiser (no deps)
  hero.ts       mountAurora(host, opts): live hero with slow drift, reduced-motion aware
  bake.ts       npx tsx brand/aurora/bake.ts → regenerates assets/aurora-*.svg
  hero.html     5z hero markup + CSS (incl. .dn-btn), uses dendrite-tokens.css variables
assets/
  aurora-{warp|dune|marble}-{hero-1440x600|hero-1920x800|og-1200x630|slide-1920x1080|swag-440|icon-512}.svg   (18 files)
assets/icons/
  dendrite-icon-d3-512.svg          rounded square (r 112)  — social avatars, PWA, iOS touch
  dendrite-icon-d3-square-512.svg   square, for maskable / platforms that round themselves
  dendrite-icon-a-512.svg           plain dark-0, rounded
  dendrite-icon-a-square-512.svg    plain dark-0, square
  dendrite-avatar-square.svg, dendrite-avatar-circle.svg, dendrite-mark-iris.svg   (copies of round-1 files, so icons/ is complete)
```

## Aurora rules (add to README §3 Colour / new §10 Aurora)
- Palette: four tiers iris-700 → iris-500 → periwinkle → iris-300, drawn as 1 px-ish contour lines on dark-0. Marble adds the magenta seam. Nothing else; never on light ground.
- Composition is fixed to a 640×360 design frame and scaled to cover, so every size shows the same picture. `seed` changes the picture; the shipped seed is 101.
- Always fade to the surface colour toward the bottom 60 % so text sits on dark-0, except square crops (swag, icon) which have no fade.
- Motion: `mountAurora` cross-fades a new frame every 4 s with `t += 0.02`; the warp field drifts, nothing scales or scrolls. `prefers-reduced-motion` renders one frame. Only the docs landing hero animates; OG, slides and swag use the baked SVGs.
- Text over aurora: wordmark and headlines in ground, lede in dark-ink-2, never on the brightest tier; keep copy in the lower 55 % where the fade is.

## Docs site
- Replace the landing hero with `aurora/hero.html` (markup + CSS; adapt class names to the site's build). Mount drift: `mountAurora(document.querySelector('.dn-hero__bg'))`. The `<img>` fallback inside shows the 1440×600 baked SVG when JS is off or motion is reduced.
- Keep nav, pillars and everything below the hero unchanged.
- OG image: switch `og:image` to `assets/aurora-warp-og-1200x630.svg` rendered to PNG with the wordmark and tagline composited as in `dendrite-og-dark.svg` (same positions, same type).

## Icons wiring
- `favicon.svg`: `dendrite-icon-a-square-512.svg` (platform rounds it).
- `apple-touch-icon` 180: `dendrite-icon-d3-square-512.svg` rendered to PNG.
- PWA manifest 512 + maskable: `dendrite-icon-d3-square-512.svg` (safe zone: the D occupies the central 56 %, inside the 80 % maskable circle).
- VS Code extension 128: `dendrite-icon-d3-512.svg`.
- npm / GitHub org avatar: `dendrite-icon-d3-512.svg` rendered to PNG.
- Below 24 px keep the reversed avatar (`dendrite-avatar-square.svg`).

## Tokens
Added to `dendrite-tokens.css` (1.2; the 1.1 editor surfaces and shipped syntax colours are untouched): `--dn-aurora-0..3` (aliases of iris-700, iris-500, periwinkle, iris-300), `--dn-aurora-seam` (magenta, marble only), `--dn-aurora-fade-from: 40%`, `--dn-aurora-interval: 4000ms`. Changelog entry added at the bottom of the file.

## Not in this round (parked in the design file)
Swag art (reaction–diffusion 4o, storm 4v/5m/6m, smoke 3s/6t/5w/5x), MinimalLayout editor variants (4ag/5ak/5al/5an), FullLayout editor layouts (3ah/3ai), pillar treatments (5af/5ag/5ah).
