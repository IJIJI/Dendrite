/**
 * Dendrite aurora — generative contour fields.
 *
 * One deterministic noise source, three fields, one marching-squares isoline
 * renderer. Output is SVG path data grouped by level so a 1920×1080 frame is
 * ~12–16 <path> elements, not thousands. The same code bakes the SVGs in
 * ../assets/aurora-*.svg (see bake.ts) and drives the live hero (hero.ts).
 *
 * Fields
 *  - "warp"   (primary, 4c): two ring systems warped by noise, seam between them
 *  - "dune"   (alt, 3b):     isolines of ridged noise, like wood grain
 *  - "marble" (alt, 3d):     two octaves, veins broken into marbling, magenta seam
 *
 * Colours come from dendrite-tokens.css: iris-500/400/300 and iris-700 for the
 * four tiers, status magenta for the seam. Pass your own `palette` to override.
 */

export type AuroraField = 'warp' | 'dune' | 'marble';

export interface AuroraPalette {
  /** tier 0..3, dark → light. Defaults: iris-700, iris-500, periwinkle, iris-300 */
  tiers: [string, string, string, string];
  /** seam / highlight colour (marble only). Default: magenta */
  seam: string;
}

export interface AuroraOptions {
  field?: AuroraField;
  width: number;
  height: number;
  /** noise seed; same seed → same picture. Default 101 */
  seed?: number;
  /** sampling step in px; 4 = fine, 8 = coarse/fast. Default: max(4, round(min(w,h)/90)) */
  resolution?: number;
  /** 0..1 phase for the drift animation; shifts the warp field in time. Default 0 */
  t?: number;
  palette?: Partial<AuroraPalette>;
  /** stroke-linecap. Default 'round' */
  linecap?: 'round' | 'butt';
}

export interface AuroraLayer {
  d: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

export const DEFAULT_PALETTE: AuroraPalette = {
  tiers: ['oklch(0.44 0.19 277)', 'oklch(0.585 0.233 277)', '#7c83f5', 'oklch(0.84 0.11 277)'],
  seam: 'oklch(0.6 0.2 330)',
};

/* ---------- noise ---------- */

function rng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export type Noise2 = (x: number, y: number, octaves?: number) => number;

/** value noise on a 64×64 wrapped lattice with smoothstep, fBm over `octaves` */
export function noise2(seed: number): Noise2 {
  const r = rng(seed);
  const g = new Float32Array(64 * 64);
  for (let i = 0; i < g.length; i++) g[i] = r() * 2 - 1;
  const v = (ix: number, iy: number) => g[((iy & 63) << 6) | (ix & 63)];
  const s = (t: number) => t * t * (3 - 2 * t);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const base = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = s(x - xi), yf = s(y - yi);
    return l(l(v(xi, yi), v(xi + 1, yi), xf), l(v(xi, yi + 1), v(xi + 1, yi + 1), xf), yf);
  };
  return (x, y, octaves = 3) => {
    let a = 0, amp = 1, fr = 1, n = 0;
    for (let o = 0; o < octaves; o++) { a += base(x * fr, y * fr) * amp; n += amp; amp *= 0.5; fr *= 2; }
    return a / n;
  };
}

/* ---------- marching squares ---------- */

type Field = (x: number, y: number) => number;

/** Isolines of `field` at each `level`, one path per level. */
export function isolines(
  field: Field, W: number, H: number, levels: number[], res: number,
): Map<number, string> {
  const cols = Math.ceil(W / res), rows = Math.ceil(H / res);
  const grid: Float32Array[] = [];
  for (let j = 0; j <= rows; j++) {
    const row = new Float32Array(cols + 1);
    for (let i = 0; i <= cols; i++) row[i] = field(i * res, j * res);
    grid.push(row);
  }
  const out = new Map<number, string>();
  const f1 = (n: number) => n.toFixed(1);
  for (const lv of levels) {
    let d = '';
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const V = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
        const P = [[i * res, j * res], [(i + 1) * res, j * res], [(i + 1) * res, (j + 1) * res], [i * res, (j + 1) * res]];
        const pts: number[][] = [];
        for (let e = 0; e < 4; e++) {
          const p = V[e], q = V[(e + 1) % 4];
          if ((p < lv) !== (q < lv)) {
            const t = (lv - p) / (q - p);
            const A = P[e], B = P[(e + 1) % 4];
            pts.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
          }
        }
        if (pts.length >= 2) d += `M${f1(pts[0][0])} ${f1(pts[0][1])}L${f1(pts[1][0])} ${f1(pts[1][1])}`;
        if (pts.length === 4) d += `M${f1(pts[2][0])} ${f1(pts[2][1])}L${f1(pts[3][0])} ${f1(pts[3][1])}`;
      }
    }
    if (d) out.set(lv, d);
  }
  return out;
}

/* ---------- fields ---------- */

const range = (n: number, a: number, s: number) => Array.from({ length: n }, (_, i) => a + i * s);

/** Build the layer list for a field. Coordinates are normalised to a 640×360
 *  design frame and scaled, so every size shows the same composition. */
export function aurora(opts: AuroraOptions): AuroraLayer[] {
  const { width: W, height: H, field = 'warp', seed = 101, t = 0 } = opts;
  const res = opts.resolution ?? Math.max(4, Math.round(Math.min(W, H) / 90));
  const pal: AuroraPalette = { ...DEFAULT_PALETTE, ...opts.palette } as AuroraPalette;
  const tier = (u: number) => pal.tiers[u > 0.75 ? 3 : u > 0.5 ? 2 : u > 0.25 ? 1 : 0];
  const n1 = noise2(seed), n2 = noise2(seed + 101), n3 = noise2(seed + 202);
  // scale: design frame 640×360 → cover the target box
  const k = Math.max(W / 640, H / 360);
  const ox = (W - 640 * k) / 2, oy = (H - 360 * k) / 2;
  const u = (x: number) => (x - ox) / k, vv = (y: number) => (y - oy) / k;
  const ph = t * Math.PI * 2;
  const layers: AuroraLayer[] = [];
  const emit = (m: Map<number, string>, color: (l: number) => string, width: (l: number) => number, opacity = 0.9) => {
    for (const [l, d] of m) layers.push({ d, stroke: color(l), strokeWidth: width(l) * k, opacity });
  };

  if (field === 'warp') {
    const f: Field = (X, Y) => {
      const x = u(X), y = vv(Y);
      const wx = x + n1(x / 90 + Math.sin(ph) * 0.3, y / 90) * 60;
      const wy = y + n2(x / 90, y / 90 + Math.cos(ph) * 0.3) * 60;
      const d1 = Math.hypot(wx - 190, wy - 230) / 24, d2 = Math.hypot(wx - 470, wy - 170) / 24;
      return Math.min(d1, d2) + 0.15 * Math.max(0, 6 - Math.abs(d1 - d2));
    };
    emit(isolines(f, W, H, range(12, 0.5, 1), res), l => tier(1 - l / 12), l => 1.3 - l * 0.07);
  } else if (field === 'dune') {
    const f: Field = (X, Y) => {
      const x = u(X), y = vv(Y);
      return 1 - Math.abs(n1(x / 220 + Math.sin(ph) * 0.15, y / 110, 4)) + n2(x / 60, y / 60, 2) * 0.15;
    };
    emit(isolines(f, W, H, range(10, 0.3, 0.07), res), l => tier((l - 0.3) / 0.7), () => 1.1);
  } else {
    const f: Field = (X, Y) => {
      const x = u(X), y = vv(Y);
      return n1(x / 140, y / 70, 3) + 0.6 * n2(x / 45 + n3(x / 200, y / 200) * 3 + Math.sin(ph) * 0.2, y / 45, 2);
    };
    emit(isolines(f, W, H, range(9, -0.5, 0.12), res),
      l => (Math.abs(l) < 0.15 ? pal.seam : tier(0.5 + l)),
      l => (Math.abs(l) < 0.15 ? 1.4 : 0.9));
  }
  return layers;
}

/* ---------- serialisation ---------- */

export interface SvgOptions extends AuroraOptions {
  /** background fill; omit for transparent. Default '#141312' (dark-0) */
  background?: string | null;
  /** vertical fade to the background from this fraction (0..1) downward; null = none. Default 0.4 */
  fadeFrom?: number | null;
}

/** Full standalone SVG string. */
export function auroraSvg(opts: SvgOptions): string {
  const { width: W, height: H, background = '#141312', fadeFrom = 0.4 } = opts;
  const layers = aurora(opts);
  const cap = opts.linecap ?? 'round';
  const paths = layers.map(l =>
    `<path d="${l.d}" stroke="${l.stroke}" stroke-width="${l.strokeWidth.toFixed(2)}" opacity="${l.opacity}"/>`).join('\n');
  const fade = fadeFrom == null || background == null ? '' :
    `<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="${fadeFrom}" stop-color="${background}" stop-opacity="0"/><stop offset="0.95" stop-color="${background}" stop-opacity="0.85"/></linearGradient></defs>\n<rect width="${W}" height="${H}" fill="url(#f)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
${background ? `<rect width="${W}" height="${H}" fill="${background}"/>` : ''}
<g fill="none" stroke-linecap="${cap}" stroke-linejoin="round">
${paths}
</g>
${fade}
</svg>
`;
}
