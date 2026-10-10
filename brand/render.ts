/**
 * Render the brand PNGs from their SVGs, through headless Chrome.
 *   node brand/render.ts
 *
 * Chrome rather than an SVG library: the aurora strokes are oklch() and the OG card sets live
 * text in Chakra Petch and Archivo, and a browser is the one renderer that is certain to
 * agree with what the site shows. The fonts are the docs' own @fontsource files.
 *
 * ponytail: the Chrome path defaults to the Windows install, set CHROME elsewhere. The PNGs
 * are committed, so nothing in CI runs this; make it portable when a second machine bakes.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const brand = dirname(fileURLToPath(import.meta.url));
const root = join(brand, "..");
const chrome = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

/** [source SVG, width, height, output PNG], paths from the repository root. */
const renders: [source: string, width: number, height: number, out: string][] = [
  ["brand/assets/icons/dendrite-icon-a-square-512.svg", 180, 180, "apps/docs/public/apple-touch-icon.png"],
  // The playground wears the reversed avatar, so its tab is not the docs' tab.
  ["brand/assets/icons/dendrite-avatar-square.svg", 180, 180, "apps/playground/public/apple-touch-icon.png"],
  ["brand/assets/icons/dendrite-avatar-square.svg", 512, 512, "brand/assets/icons/dendrite-avatar-square.png"],
  ["brand/assets/dendrite-og-aurora.svg", 1200, 630, "apps/docs/public/og.png"],
];

const font = (family: string, weight: number) => {
  const slug = family.toLowerCase().replace(" ", "-");
  const file = `node_modules/@fontsource/${slug}/files/${slug}-latin-${weight}-normal.woff2`;
  return `@font-face{font-family:"${family}";font-weight:${weight};src:url("${pathToFileURL(join(root, file))}")}`;
};

const temp = mkdtempSync(join(tmpdir(), "dendrite-render-"));
for (const [source, width, height, out] of renders) {
  // The SVG is inlined: an SVG behind <img> may not load a font, an inline one may.
  const svg = readFileSync(join(root, source), "utf8").replace(/<metadata>[\s\S]*?<\/metadata>/, "");
  const page = join(temp, "page.html");
  writeFileSync(
    page,
    `<!doctype html><style>${font("Chakra Petch", 600)}${font("Archivo", 400)}` +
      `html,body{margin:0;overflow:hidden}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`,
  );
  execFileSync(chrome, [
    "--headless=new",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${width},${height}`,
    // Lets the web fonts finish before the capture.
    "--virtual-time-budget=5000",
    `--screenshot=${join(root, out)}`,
    pathToFileURL(page).href,
  ], { stdio: "ignore" }); // Chrome logs its own extension noise to stderr
  console.log(`${out}  ${statSync(join(root, out)).size} bytes`);
}
