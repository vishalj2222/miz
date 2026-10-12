import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = -1
  for (const b of buf) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(width, height, pixelFn) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = width * 4 + 1
  const raw = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height)
      const off = y * stride + 1 + x * 4
      raw[off] = r
      raw[off + 1] = g
      raw[off + 2] = b
      raw[off + 3] = a
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const INK = [0x14, 0x15, 0x0f]
const PAPER = [0xed, 0xee, 0xea]

// The mark: a paper plate ring with a dot of food on ink. Geometric, on-token.
function mark(x, y, size) {
  const d = Math.hypot(x - size / 2, y - size / 2)
  const ring = d > size * 0.26 && d < size * 0.34
  const dot = d < size * 0.08
  const c = ring || dot ? PAPER : INK
  return [...c, 255]
}

mkdirSync('public', { recursive: true })
for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
  writeFileSync(`public/${name}`, png(size, size, mark))
}

// Launch screens: the mark inverted (ink on paper) so the app opens onto its
// own ground instead of a white flash. Portrait sizes in device pixels; keep
// in sync with SPLASH_SCREENS in src/lib/splash.ts.
const SPLASH = [
  [1320, 2868], [1206, 2622], [1260, 2736], [1290, 2796], [1179, 2556],
  [1284, 2778], [1170, 2532], [1125, 2436], [1242, 2688], [828, 1792], [750, 1334],
]
function splashMark(x, y, w, h) {
  const unit = w * 0.32 // mark diameter scale, relative to screen width
  const d = Math.hypot(x - w / 2, y - h / 2)
  const ring = d > unit * 0.26 && d < unit * 0.34
  const dot = d < unit * 0.08
  return [...(ring || dot ? INK : PAPER), 255]
}
mkdirSync('public/splash', { recursive: true })
for (const [w, h] of SPLASH) {
  writeFileSync(`public/splash/${w}x${h}.png`, png(w, h, splashMark))
}
console.log('icons + splash screens written')
