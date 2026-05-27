#!/usr/bin/env node
/**
 * Render every platform icon NovexDB needs from `assets/logo/icon.svg`.
 *
 * Outputs:
 *   build/icon.iconset/        ← intermediate .png set (macOS retina sizes)
 *   build/icon.icns            ← macOS app icon (via `iconutil`)
 *   build/icon.ico             ← Windows app icon (multi-resolution)
 *   build/icon.png             ← Linux 512px PNG (electron-builder fallback)
 *   build/icons/<size>.png     ← every PNG size as a flat folder, useful
 *                                for splash screens, README, and dock fallbacks
 *
 * Re-run after editing any SVG in `assets/logo/`:
 *
 *     npm run icons
 *
 * Adding a new size? Append it to PNG_SIZES below.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'assets', 'logo', 'icon.svg')
const BUILD = join(ROOT, 'build')
const ICONSET = join(BUILD, 'icon.iconset')
const FLAT = join(BUILD, 'icons')

// Sizes electron-builder packs into the .app / .exe. iconset names follow
// Apple's convention: <name>_<pt>x<pt>[@2x].png — keep them exact.
const ICONSET_FILES = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 }
]

// Flat sizes useful for in-app references (splash, settings header, etc.).
const FLAT_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

// Windows .ico needs an explicit set — these are the multi-resolution
// frames that ship inside the single .ico file.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

function freshDir(path) {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true })
  mkdirSync(path, { recursive: true })
}

async function renderPng(svgBuffer, size, outPath) {
  await sharp(svgBuffer, { density: Math.max(72, size) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath)
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`✗ Missing source SVG: ${SRC}`)
    process.exit(1)
  }
  const svg = readFileSync(SRC)

  freshDir(ICONSET)
  freshDir(FLAT)

  // 1. macOS iconset frames.
  console.log('→ Rendering macOS iconset frames…')
  for (const { name, size } of ICONSET_FILES) {
    await renderPng(svg, size, join(ICONSET, name))
    process.stdout.write(`  ${name} (${size}px)\n`)
  }

  // 2. Flat PNG sizes.
  console.log('→ Rendering flat PNG sizes…')
  for (const size of FLAT_SIZES) {
    await renderPng(svg, size, join(FLAT, `${size}.png`))
    process.stdout.write(`  ${size}.png\n`)
  }

  // 3. macOS .icns via Apple's `iconutil` — bundled with Xcode CLT, also
  // present on every dev Mac without it. Skips with a warning if missing.
  console.log('→ Packing build/icon.icns…')
  try {
    execFileSync('iconutil', ['-c', 'icns', '-o', join(BUILD, 'icon.icns'), ICONSET], {
      stdio: 'inherit'
    })
  } catch (err) {
    console.warn(`  ⚠ iconutil failed (${err.message}). .icns NOT generated.`)
  }

  // 4. Linux 512px PNG (electron-builder picks this up via icon: build/).
  console.log('→ Rendering build/icon.png (Linux)…')
  await renderPng(svg, 512, join(BUILD, 'icon.png'))

  // 5. Windows .ico — multi-resolution.
  console.log('→ Packing build/icon.ico (Windows)…')
  const icoBuffers = await Promise.all(
    ICO_SIZES.map(async (size) => {
      const buf = await sharp(svg, { density: Math.max(72, size) })
        .resize(size, size)
        .png({ compressionLevel: 9 })
        .toBuffer()
      return buf
    })
  )
  const icoOut = await pngToIco(icoBuffers)
  writeFileSync(join(BUILD, 'icon.ico'), icoOut)

  console.log('\n✓ Icons generated in build/')
}

main().catch((err) => {
  console.error('✗ Icon generation failed:', err)
  process.exit(1)
})
