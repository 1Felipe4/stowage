// One-shot PWA icon generator — zero deps, writes PNGs via zlib by hand.
// Usage: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public')
mkdirSync(OUT, { recursive: true })

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length)
  return out
}
function png(w, h, px) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0 // filter none
    px.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]
const INK = hex('#081120'),
  CELLBG = hex('#122540'),
  BLUE = hex('#4FD1E0'),
  GOLD = hex('#E8B84B'),
  HOT = hex('#F2793D'),
  LINE = hex('#1e3a5c')

function canvas(size) {
  const px = Buffer.alloc(size * size * 4)
  const set = (x, y, [r, g, b], a = 1) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    const ia = 1 - a
    px[i] = r * a + px[i] * ia
    px[i + 1] = g * a + px[i + 1] * ia
    px[i + 2] = b * a + px[i + 2] * ia
    px[i + 3] = 255
  }
  const rect = (x, y, w, h, c, a = 1) => {
    for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) set(i, j, c, a)
  }
  return { px, rect, size }
}

// Design on a 64-unit grid: three cargo crates on the deck plan.
function draw(size, scale = 1) {
  const cv = canvas(size)
  const u = size / 64
  cv.rect(0, 0, size, size, INK)
  // faint deck grid
  for (let g = 8; g < 64; g += 8) {
    cv.rect(g * u, 0, Math.max(1, u * 0.6), size, BLUE, 0.07)
    cv.rect(0, g * u, size, Math.max(1, u * 0.6), BLUE, 0.07)
  }
  const crate = (x, y, w, h, c) => {
    const cx = 32 + (x - 32) * scale,
      cy = 32 + (y - 32) * scale
    const cw = w * scale,
      ch = h * scale
    cv.rect(cx * u, cy * u, cw * u, ch * u, c) // shell
    cv.rect((cx + 2) * u, (cy + 2) * u, (cw - 4) * u, (ch - 4) * u, CELLBG) // interior
    cv.rect((cx + 2) * u, (cy + 2) * u, (cw - 4) * u, 2.4 * scale * u, c, 0.55) // lid band
    cv.rect((cx + cw / 2 - 1) * u, (cy + 2) * u, 2 * scale * u, (ch - 4) * u, c, 0.35) // seam
  }
  // frame
  cv.rect(6 * u, 6 * u, 52 * u, Math.max(1, 1.2 * u), LINE)
  cv.rect(6 * u, 56.8 * u, 52 * u, Math.max(1, 1.2 * u), LINE)
  cv.rect(6 * u, 6 * u, Math.max(1, 1.2 * u), 52 * u, LINE)
  cv.rect(56.8 * u, 6 * u, Math.max(1, 1.2 * u), 52 * u, LINE)
  crate(11, 33, 19, 19, GOLD)
  crate(34, 33, 19, 19, HOT)
  crate(22.5, 11, 19, 19, BLUE)
  return png(size, size, cv.px)
}

writeFileSync(join(OUT, 'pwa-512.png'), draw(512))
writeFileSync(join(OUT, 'pwa-192.png'), draw(192))
writeFileSync(join(OUT, 'pwa-512-maskable.png'), draw(512, 0.72))
writeFileSync(join(OUT, 'apple-touch-icon.png'), draw(180, 0.85))
console.log('icons written to', OUT)
