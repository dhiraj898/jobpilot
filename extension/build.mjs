import * as esbuild from 'esbuild'
import { copyFileSync, mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = resolve(__dirname, 'dist')
mkdirSync(dist, { recursive: true })
mkdirSync(resolve(dist, 'icons'), { recursive: true })

const shared = { bundle: true, platform: 'browser', target: 'chrome120', logLevel: 'info' }

await Promise.all([
  esbuild.build({
    ...shared,
    entryPoints: ['src/sidepanel/index.ts'],
    outfile: 'dist/sidepanel.js',
    format: 'esm',
    define: {
      APP_URL_DEFINE: process.env.APP_URL ? JSON.stringify(process.env.APP_URL) : '"https://jobpilot.app"',
    },
  }),
  esbuild.build({
    ...shared,
    entryPoints: ['src/background/index.ts'],
    outfile: 'dist/background.js',
    format: 'esm',
  }),
  esbuild.build({
    ...shared,
    entryPoints: ['src/content/index.ts'],
    outfile: 'dist/content.js',
    format: 'iife',
  }),
])

copyFileSync('sidepanel.html', 'dist/sidepanel.html')
copyFileSync('src/sidepanel/style.css', 'dist/sidepanel.css')
copyFileSync('manifest.json', 'dist/manifest.json')

// Generate minimal placeholder icons using 1x1 pixel PNGs (base64)
const ICON_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)
for (const size of [16, 48, 128]) {
  const iconPath = resolve(dist, 'icons', `icon${size}.png`)
  writeFileSync(iconPath, ICON_1PX)
}

console.log('Extension built to dist/')
