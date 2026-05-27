import type { NextConfig } from 'next'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Next looks at every parent directory for a package-lock.json to guess
// the "workspace root" used by file-tracing on `next build`. The DataForge
// repo has TWO lockfiles — the root one (Electron app) and this one
// (website) — so Next prints a multi-line yellow warning on every dev
// boot until we pin the root explicitly. Without this it still works,
// but the warning reads like an error in the terminal.
const root = dirname(fileURLToPath(import.meta.url))

const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: root
}

export default config
