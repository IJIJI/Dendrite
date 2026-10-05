/**
 * Live hero aurora with slow drift.
 *
 * Mounts an <svg> into `host`, renders the warp field, and re-renders every
 * `interval` ms with `t` advancing by `step`; the browser cross-fades between
 * frames with a CSS transition so the motion reads as drift, not stepping.
 * Cheap: a 1440×600 frame at resolution 8 is ~12 paths and ~2 ms.
 *
 * Honors prefers-reduced-motion (renders one frame, no timer) and pauses when
 * the tab is hidden.
 *
 * Usage (docs landing hero, option 5z):
 *   const stop = mountAurora(document.querySelector('.hero-bg')!, { field: 'warp' });
 *   // later: stop();
 */
import { aurora, type AuroraField, type AuroraPalette } from './aurora';

export interface HeroAuroraOptions {
  field?: AuroraField;
  seed?: number;
  palette?: Partial<AuroraPalette>;
  /** ms between frames. Default 4000 */
  interval?: number;
  /** phase advance per frame (0..1 is one full loop). Default 0.02 */
  step?: number;
  /** cross-fade duration ms. Default = interval */
  fade?: number;
  /** sampling step px. Default 8 (coarser than bake for speed) */
  resolution?: number;
}

const NS = 'http://www.w3.org/2000/svg';

export function mountAurora(host: HTMLElement, opts: HeroAuroraOptions = {}): () => void {
  const { field = 'warp', seed = 101, interval = 4000, step = 0.02, resolution = 8 } = opts;
  const fade = opts.fade ?? interval;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
  host.appendChild(svg);

  let W = 0, H = 0, t = 0, timer = 0;
  let layers: SVGGElement[] = [];

  const frame = () => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('fill', 'none');
    g.setAttribute('stroke-linecap', 'round');
    g.setAttribute('stroke-linejoin', 'round');
    g.style.cssText = `opacity:0;transition:opacity ${reduce ? 0 : fade}ms linear`;
    for (const l of aurora({ field, width: W, height: H, seed, t, resolution, palette: opts.palette })) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', l.d);
      p.setAttribute('stroke', l.stroke);
      p.setAttribute('stroke-width', l.strokeWidth.toFixed(2));
      p.setAttribute('opacity', String(l.opacity));
      g.appendChild(p);
    }
    svg.appendChild(g);
    requestAnimationFrame(() => (g.style.opacity = '1'));
    layers.push(g);
    // keep two frames: the fading-out one and the new one
    while (layers.length > 2) layers.shift()!.remove();
    if (layers.length === 2) {
      const old = layers[0];
      old.style.opacity = '0';
      setTimeout(() => old.remove(), fade + 50);
      layers = [g];
    }
    t = (t + step) % 1;
  };

  const resize = () => {
    const r = host.getBoundingClientRect();
    if (Math.round(r.width) === W && Math.round(r.height) === H) return;
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    layers.forEach(l => l.remove()); layers = [];
    frame();
  };

  const start = () => { if (!reduce && !timer) timer = window.setInterval(frame, interval); };
  const stop = () => { if (timer) { clearInterval(timer); timer = 0; } };
  const onVis = () => (document.hidden ? stop() : start());

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  start();
  document.addEventListener('visibilitychange', onVis);

  return () => {
    stop(); ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    svg.remove();
  };
}
