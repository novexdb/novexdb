# NovexDB logo assets

All NovexDB icons are derived from a single source SVG and rendered out
to every format Electron's packagers need.

## Source files

| File | Purpose |
| --- | --- |
| `icon.svg` | The master 1024×1024 app icon with the gradient background. Every PNG / ICNS / ICO ships from this. |
| `mark-mono.svg` | Monochrome "N" mark, no background. Uses `currentColor` so it inherits styling — drop it inline in React. |
| `wordmark.svg` | Horizontal lockup: mark + "NovexDB" text. For splash screens, the About dialog, and the README. |

## Generating platform icons

```bash
npm run icons
```

That runs [`scripts/generate-icons.mjs`](../../scripts/generate-icons.mjs)
which uses `sharp` (with libvips' built-in rsvg backend) to rasterise
`icon.svg` at every size, then:

- Packs the macOS `iconset` into `build/icon.icns` via Apple's `iconutil`.
- Packs the Windows multi-resolution `build/icon.ico` via `png-to-ico`.
- Writes `build/icon.png` (Linux fallback) and `build/icons/<size>.png`
  (flat folder for in-app use).

After edit-and-regen, `electron-builder` picks the new icons up
automatically because `directories.buildResources` points at `build/`.

## Design tokens

| Token | Value |
| --- | --- |
| Background gradient | `#3b82f6` → `#2563eb` → `#1e3a8a` (top-left → bottom-right) |
| Mark colour | `#ffffff` (with a faint cool gradient on the diagonal stroke) |
| Corner radius | 224 / 1024 = ~22% (macOS app-icon convention) |
| Mark margin | 256 px on each side of the 1024 canvas |

If you change the source SVG, keep the 22% corner radius and the 25%
margin — both are the conventions macOS uses for system icons and
deviating makes the icon look amateur in the Dock.
