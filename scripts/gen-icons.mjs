// App icons and iOS launch screens: the MISE wordmark in IBM Plex Mono (the
// app's data/label face), ink on paper. Rendered with the satori + resvg
// renderer bundled in Next. Run: npm run icons
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ImageResponse } from 'next/dist/compiled/@vercel/og/index.node.js'

const INK = '#14150F'
const PAPER = '#EDEEEA'
const font = readFileSync(new URL('./fonts/IBMPlexMono-Medium.ttf', import.meta.url))

// Plex Mono glyphs advance 0.6em, so MISE is 2.4em wide. `widthFraction` is
// how much of the canvas width the word spans.
async function wordmark(width, height, widthFraction) {
  const tree = {
    type: 'div',
    props: {
      style: {
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: PAPER,
        color: INK,
        fontFamily: 'Plex',
        fontSize: (width * widthFraction) / 2.4,
        lineHeight: 1,
      },
      children: 'MISE',
    },
  }
  const res = new ImageResponse(tree, {
    width,
    height,
    fonts: [{ name: 'Plex', data: font, weight: 500 }],
  })
  return Buffer.from(await res.arrayBuffer())
}

// Icons are full-bleed squares: iOS rounds the corners itself (pre-rounded
// corners would show up black). The word spans nearly edge to edge.
mkdirSync('public', { recursive: true })
for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
  writeFileSync(`public/${name}`, await wordmark(size, size, 0.88))
}

// Launch screens: same wordmark, smaller, on the paper ground — so the app
// opens onto its own colour instead of a white flash. Portrait sizes in device
// pixels; keep in sync with SPLASH_SCREENS in src/lib/splash.ts.
const SPLASH = [
  [1320, 2868], [1206, 2622], [1260, 2736], [1290, 2796], [1179, 2556],
  [1284, 2778], [1170, 2532], [1125, 2436], [1242, 2688], [828, 1792], [750, 1334],
]
mkdirSync('public/splash', { recursive: true })
for (const [w, h] of SPLASH) {
  writeFileSync(`public/splash/${w}x${h}.png`, await wordmark(w, h, 0.4))
}
console.log('icons + launch screens written')
