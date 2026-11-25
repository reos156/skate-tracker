// Genera los iconos PNG de la PWA sin dependencias: dibuja por pixel y
// escribe el PNG a mano (zlib viene con node).

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'icons');

const DEEP = [6, 40, 59];
const PISTA = [10, 61, 92];
const AMARILLO = [255, 199, 44];
const CORAL = [217, 72, 15];
const BLANCO = [255, 255, 255];

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Color del icono en coordenadas normalizadas 0..1. */
function sample(u, v, { maskable }) {
  const cx = 0.5;
  const cy = maskable ? 0.5 : 0.52;
  const dx = u - cx;
  const dy = v - cy;
  const radius = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx); // -pi..pi, 0 = derecha

  // fondo: degradé diagonal de pista a profundo
  let color = mix(PISTA, DEEP, Math.min(1, Math.max(0, (u + v) / 2)));

  const ringOuter = maskable ? 0.30 : 0.33;
  const ringInner = ringOuter - 0.075;
  const inRing = radius <= ringOuter && radius >= ringInner;
  if (inRing) color = AMARILLO;

  // el punto de la patinadora sobre la pista
  const dotAngle = -Math.PI * 0.22;
  const dotR = (ringOuter + ringInner) / 2;
  const dotX = cx + Math.cos(dotAngle) * dotR;
  const dotY = cy + Math.sin(dotAngle) * dotR;
  const dotRadius = ringOuter * 0.46;
  const dotDist = Math.hypot(u - dotX, v - dotY);
  if (dotDist <= dotRadius) color = CORAL;
  else if (dotDist <= dotRadius + 0.012) color = BLANCO;

  return color;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidad
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filtro none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(size, options) {
  const px = Buffer.alloc(size * size * 4);
  const ss = 3; // supermuestreo para suavizar bordes
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          const [cr, cg, cb] = sample(u, v, options);
          r += cr;
          g += cg;
          b += cb;
        }
      }
      const total = ss * ss;
      const offset = (y * size + x) * 4;
      px[offset] = Math.round(r / total);
      px[offset + 1] = Math.round(g / total);
      px[offset + 2] = Math.round(b / total);
      px[offset + 3] = 255;
    }
  }
  return encodePng(size, size, px);
}

mkdirSync(OUT, { recursive: true });
const targets = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['maskable-512.png', 512, { maskable: true }],
];
for (const [name, size, options] of targets) {
  writeFileSync(resolve(OUT, name), render(size, options));
  console.log(`icons/${name} · ${size}×${size}`);
}