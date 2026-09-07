'use strict';

/**
 * Generates build/icon.ico from the red asylum dress. Pure JS: pngjs reads and
 * writes the pixels, png-to-ico packs them.
 *
 * Each size is resampled straight from the full-resolution source with an exact
 * area filter (every destination pixel averages the whole source region it
 * covers). Going 720px -> 16px is a 45x reduction, which a bicubic/Catmull-Rom
 * kernel would badly alias since it only samples 4 taps per axis.
 *
 *   node scripts/make-icon.js
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SOURCE = path.join('Dressicons', 'reddress.png');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const FILL = 0.94; // fraction of the icon box the dress spans
const ALPHA_FLOOR = 8; // ignore near-invisible pixels when trimming
const SHARPEN_BELOW = 64; // small sizes get a touch of unsharp
const SHARPEN_AMOUNT = 0.35;

// Trim transparent padding so the dress fills as much of the icon as possible.
function contentBounds(png) {
  const { width: w, height: h, data: d } = png;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (d[(y * w + x) * 4 + 3] > ALPHA_FLOOR) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, w, h };
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Crop to bounds, premultiplied so the transparent surround cannot bleed dark
// fringes into the silhouette when the image is averaged down.
function cropPremultiplied(png, b) {
  const out = new Float32Array(b.w * b.h * 4);
  for (let y = 0; y < b.h; y += 1) {
    for (let x = 0; x < b.w; x += 1) {
      const s = ((y + b.y0) * png.width + (x + b.x0)) * 4;
      const o = (y * b.w + x) * 4;
      const a = png.data[s + 3];
      const f = a / 255;
      out[o] = png.data[s] * f;
      out[o + 1] = png.data[s + 1] * f;
      out[o + 2] = png.data[s + 2] * f;
      out[o + 3] = a;
    }
  }
  return out;
}

// Exact-coverage area filter, one axis at a time.
function areaResize(src, sw, sh, dw, dh) {
  const mid = new Float32Array(dw * sh * 4);
  const sx = sw / dw;
  for (let y = 0; y < sh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      const a0 = x * sx;
      const a1 = (x + 1) * sx;
      let total = 0;
      const acc = [0, 0, 0, 0];
      for (let i = Math.floor(a0); i < Math.ceil(a1); i += 1) {
        const wgt = Math.min(a1, i + 1) - Math.max(a0, i);
        if (wgt <= 0) continue;
        const si = (y * sw + Math.min(sw - 1, i)) * 4;
        acc[0] += src[si] * wgt;
        acc[1] += src[si + 1] * wgt;
        acc[2] += src[si + 2] * wgt;
        acc[3] += src[si + 3] * wgt;
        total += wgt;
      }
      const o = (y * dw + x) * 4;
      for (let c = 0; c < 4; c += 1) mid[o + c] = total > 0 ? acc[c] / total : 0;
    }
  }

  const out = new Float32Array(dw * dh * 4);
  const sy = sh / dh;
  for (let y = 0; y < dh; y += 1) {
    const a0 = y * sy;
    const a1 = (y + 1) * sy;
    for (let x = 0; x < dw; x += 1) {
      let total = 0;
      const acc = [0, 0, 0, 0];
      for (let i = Math.floor(a0); i < Math.ceil(a1); i += 1) {
        const wgt = Math.min(a1, i + 1) - Math.max(a0, i);
        if (wgt <= 0) continue;
        const si = (Math.min(sh - 1, i) * dw + x) * 4;
        acc[0] += mid[si] * wgt;
        acc[1] += mid[si + 1] * wgt;
        acc[2] += mid[si + 2] * wgt;
        acc[3] += mid[si + 3] * wgt;
        total += wgt;
      }
      const o = (y * dw + x) * 4;
      for (let c = 0; c < 4; c += 1) out[o + c] = total > 0 ? acc[c] / total : 0;
    }
  }
  return out;
}

function sharpen(buf, w, h, amount) {
  const kern = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const out = new Float32Array(buf.length);
  const at = (v, max) => (v < 0 ? 0 : v > max ? max : v);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        let acc = 0;
        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const i = (at(y + ky, h - 1) * w + at(x + kx, w - 1)) * 4;
            acc += buf[i + c] * kern[(ky + 1) * 3 + (kx + 1)];
          }
        }
        out[o + c] = buf[o + c] + amount * (buf[o + c] - acc / 16);
      }
    }
  }
  return out;
}

// Centre on a square transparent canvas and undo the premultiply.
function compose(buf, w, h, size) {
  const png = new PNG({ width: size, height: size, colorType: 6 });
  png.data.fill(0);
  const offX = Math.round((size - w) / 2);
  const offY = Math.round((size - h) / 2);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const s = (y * w + x) * 4;
      const d = ((y + offY) * size + (x + offX)) * 4;
      let a = buf[s + 3];
      a = a < 0 ? 0 : a > 255 ? 255 : a;
      const inv = a > 0 ? 255 / a : 0;
      for (let c = 0; c < 3; c += 1) {
        let v = buf[s + c] * inv;
        v = v < 0 ? 0 : v > 255 ? 255 : v;
        png.data[d + c] = Math.round(v);
      }
      png.data[d + 3] = Math.round(a);
    }
  }
  return png;
}

function renderSize(source, bounds, size) {
  const scale = (size * FILL) / Math.max(bounds.w, bounds.h);
  const w = Math.max(1, Math.round(bounds.w * scale));
  const h = Math.max(1, Math.round(bounds.h * scale));

  let buf = cropPremultiplied(source, bounds);
  buf = areaResize(buf, bounds.w, bounds.h, w, h);
  if (size <= SHARPEN_BELOW) buf = sharpen(buf, w, h, SHARPEN_AMOUNT);

  return PNG.sync.write(compose(buf, w, h, size));
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const srcFile = path.join(root, SOURCE);
  const buildDir = path.join(root, 'build');
  const outFile = path.join(buildDir, 'icon.ico');

  if (!fs.existsSync(srcFile)) {
    throw new Error('icon source not found: ' + srcFile);
  }

  const source = PNG.sync.read(fs.readFileSync(srcFile));
  const bounds = contentBounds(source);

  fs.mkdirSync(buildDir, { recursive: true });

  // png-to-ico v3 is ESM only, so pull it in dynamically from this CJS script.
  const { default: pngToIco } = await import('png-to-ico');

  const ico = await pngToIco(SIZES.map((size) => renderSize(source, bounds, size)));
  fs.writeFileSync(outFile, ico); // overwrites any existing icon

  console.log(
    'icon.ico written from ' + SOURCE +
    ' (' + source.width + 'x' + source.height + ', content ' + bounds.w + 'x' + bounds.h + ')'
  );
  console.log('  sizes ' + SIZES.join(', ') + '  ->  ' + (ico.length / 1024).toFixed(1) + ' KB');
}

main().catch((err) => {
  console.error('make-icon failed:', err.message);
  process.exit(1);
});
