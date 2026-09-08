// Genere les icones PNG de la PWA sans dependance externe :
// rasterisation manuelle (supersampling x3) + encodeur PNG via zlib.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/icons');
fs.mkdirSync(OUT, { recursive: true });

/* ---------- encodeur PNG ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtre None
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- mini rasteriseur ---------- */
function makeCanvas(size) {
  return { size, buf: new Float64Array(size * size * 4) };
}
function setPx(c, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= c.size || y >= c.size) return;
  const i = (y * c.size + x) * 4;
  const ia = 1 - a;
  c.buf[i] = c.buf[i] * ia + r * a;
  c.buf[i + 1] = c.buf[i + 1] * ia + g * a;
  c.buf[i + 2] = c.buf[i + 2] * ia + b * a;
  c.buf[i + 3] = c.buf[i + 3] * ia + 255 * a;
}
function fillAll(c, color) {
  for (let y = 0; y < c.size; y++) for (let x = 0; x < c.size; x++) setPx(c, x, y, color);
}
function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// colorFn(x, y) -> [r,g,b,a] ; permet un degrade
function fillPoly(c, pts, colorFn) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(c.size - 1, Math.ceil(maxY)); y++) {
    for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(c.size - 1, Math.ceil(maxX)); x++) {
      if (inPoly(pts, x + 0.5, y + 0.5)) setPx(c, x, y, typeof colorFn === 'function' ? colorFn(x, y) : colorFn);
    }
  }
}
function thickLine(c, a, b, w, color) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2), ny = (dx / len) * (w / 2);
  fillPoly(c, [
    [a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]
  ], color);
}
function roundedRectPts(size, r, steps = 12) {
  const pts = [];
  const corners = [[r, r, 180, 270], [size - r, r, 270, 360], [size - r, size - r, 0, 90], [r, size - r, 90, 180]];
  for (const [cx, cy, a0, a1] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return pts;
}
function downsample(c, factor, target) {
  const out = Buffer.alloc(target * target * 4);
  for (let y = 0; y < target; y++) {
    for (let x = 0; x < target; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const i = ((y * factor + sy) * c.size + (x * factor + sx)) * 4;
          r += c.buf[i]; g += c.buf[i + 1]; b += c.buf[i + 2]; a += c.buf[i + 3];
        }
      }
      const n = factor * factor, o = (y * target + x) * 4;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

/* ---------- le glyphe : un d20 stylise ---------- */
const INK = [20, 16, 25, 1];
const INK_SOFT = [32, 26, 44, 1];

function drawIcon(target, { maskable = false, transparent = false } = {}) {
  const SS = 3;
  const c = makeCanvas(target * SS);
  const S = c.size;

  if (!transparent) {
    if (maskable) {
      fillAll(c, INK);
    } else {
      fillPoly(c, roundedRectPts(S, S * 0.22, 24), (x, y) => {
        const t = y / S;
        return [20 + 22 * t, 16 + 14 * t, 25 + 30 * t, 1];
      });
    }
  }

  const cx = S / 2, cy = S / 2;
  const R = S * (maskable ? 0.30 : 0.38);
  const hex = [];
  for (let i = 0; i < 6; i++) {
    const a = ((90 + 60 * i) * Math.PI) / 180;
    hex.push([cx + R * Math.cos(a), cy - R * Math.sin(a)]);
  }
  const gold = (x, y) => {
    const t = Math.min(1, Math.max(0, (y - (cy - R)) / (2 * R)));
    return [
      Math.round(246 - 76 * t),
      Math.round(206 - 90 * t),
      Math.round(122 - 66 * t),
      1
    ];
  };
  fillPoly(c, hex, gold);

  // triangle interieur inverse (face du d20)
  const r2 = R * 0.60;
  const tri = [];
  for (let i = 0; i < 3; i++) {
    const a = ((270 + 120 * i) * Math.PI) / 180;
    tri.push([cx + r2 * Math.cos(a), cy - r2 * Math.sin(a)]);
  }
  fillPoly(c, tri, maskable ? INK : INK_SOFT);

  // aretes reliant le triangle aux sommets du haut
  const w = S * 0.022;
  const edge = maskable ? INK : INK_SOFT;
  thickLine(c, tri[0], hex[3], w, edge);
  thickLine(c, tri[1], hex[5], w, edge);
  thickLine(c, tri[2], hex[1], w, edge);

  return encodePNG(target, target, downsample(c, SS, target));
}

const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}]
];
for (const [name, size, opts] of jobs) {
  fs.writeFileSync(path.join(OUT, name), drawIcon(size, opts));
  console.log('  ->', name, size + 'px');
}

fs.writeFileSync(
  path.resolve('public/favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f6ce7a"/><stop offset="1" stop-color="#aa7438"/>
  </linearGradient></defs>
  <rect width="64" height="64" rx="14" fill="#141019"/>
  <path d="M32 8 L53 20 L53 44 L32 56 L11 44 L11 20 Z" fill="url(#g)"/>
  <path d="M32 46 L18.5 22.5 L45.5 22.5 Z" fill="#201a2c"/>
</svg>
`
);
console.log('  -> favicon.svg');
