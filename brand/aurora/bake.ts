/**
 * Bake the static aurora SVGs into ../assets/.
 *   npx tsx brand/aurora/bake.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auroraSvg, type AuroraField } from './aurora';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(out, { recursive: true });

const sizes: Record<string, [number, number]> = {
  'hero-1440x600': [1440, 600],
  'hero-1920x800': [1920, 800],
  'og-1200x630': [1200, 630],
  'slide-1920x1080': [1920, 1080],
  'swag-440': [440, 440],
  'icon-512': [512, 512],
};
const fields: AuroraField[] = ['warp', 'dune', 'marble'];

for (const field of fields) {
  for (const [name, [w, h]] of Object.entries(sizes)) {
    const isSquare = w === h;
    const svg = auroraSvg({
      field, width: w, height: h,
      // squares (swag, icon) get no bottom fade; the icon is a crop, so sample finer
      fadeFrom: isSquare ? null : 0.4,
      resolution: name === 'icon-512' ? 3 : undefined,
    });
    writeFileSync(join(out, `aurora-${field}-${name}.svg`), svg);
  }
}
console.log(`baked ${fields.length * Object.keys(sizes).length} files to ${out}`);
