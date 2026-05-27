import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { loader } from '@monaco-editor/react'

/**
 * Monaco worker wiring. The SQL language has no background language service, so
 * the base editor worker is the only one ever requested.
 */
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker()
}

// Use the bundled monaco-editor package instead of loading it from a CDN —
// the app must work fully offline and within a strict CSP.
loader.config({ monaco })
