#!/usr/bin/env node
/**
 * Patch the dev Electron.app bundle so the macOS Dock shows "NovexDB"
 * (not "Electron") for unpackaged dev runs of the app.
 *
 * The dev binary lives at:
 *   node_modules/electron/dist/Electron.app/Contents/{Info.plist,Resources/electron.icns}
 *
 * macOS reads CFBundleName / CFBundleDisplayName from Info.plist for
 * Dock tooltips, the menu-bar app name, and the cmd-tab switcher.
 * `app.setName()` at runtime can't override those — the read happens
 * before our JS executes. The same goes for the Dock icon: the Dock
 * pre-paints the bundle's `electron.icns` while the app is launching.
 *
 * This script overrides both, idempotently, so a fresh `npm install`
 * gets the right name + icon without manual steps.
 *
 * Cross-platform: silently no-ops on Linux/Windows where there's no
 * such bundle and the issue doesn't exist.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, utimesSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_NAME = 'NovexDB'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

if (process.platform !== 'darwin') {
  // Nothing to patch — Linux/Windows dev runs already pick up the right
  // name from BrowserWindow.setTitle / electron-builder's productName.
  process.exit(0)
}

const bundle = join(ROOT, 'node_modules', 'electron', 'dist', 'Electron.app')
const plist = join(bundle, 'Contents', 'Info.plist')
const icnsTarget = join(bundle, 'Contents', 'Resources', 'electron.icns')
const icnsSource = join(ROOT, 'build', 'icon.icns')

if (!existsSync(plist)) {
  // electron isn't installed yet (the postinstall sequence isn't
  // guaranteed) — bail quietly.
  process.exit(0)
}

// 1. Rename the bundle in Info.plist so the Dock, app menu and cmd-tab
//    all read the right name. PlistBuddy ships with macOS, no extra deps.
const setKey = (key, value) => {
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist])
  } catch {
    // Key might be missing on a fresh bundle — fall back to Add.
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plist])
  }
}
setKey('CFBundleName', APP_NAME)
setKey('CFBundleDisplayName', APP_NAME)

// 2. Replace the bundled icon with ours, if `npm run icons` has run.
//    Skip silently if not — the Dock will fall back to the default
//    Electron art rather than rendering a missing-icon placeholder.
if (existsSync(icnsSource)) {
  copyFileSync(icnsSource, icnsTarget)
}

// 3. Touch the bundle so LaunchServices and the Dock notice the change
//    on the next launch. Without this they keep painting the cached
//    icon/name until the next reboot.
const now = new Date()
utimesSync(bundle, now, now)

console.log(`✓ Patched dev Electron bundle → ${APP_NAME}`)
