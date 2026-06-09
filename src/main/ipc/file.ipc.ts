import { createReadStream, promises as fs } from 'node:fs'
import { basename } from 'node:path'
import { createGunzip } from 'node:zlib'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { failFrom, ok } from '@main/utils/result'
import { IpcChannels } from '@shared/ipc-contract'
import { fileExportSchema, fileOpenSchema } from '@shared/schemas/query.schema'
import type { SqlImportKind } from '@shared/types/query'

/** Bytes of a .sql dump read for the at-a-glance preview. */
const SQL_PREVIEW_BYTES = 8 * 1024

/** Read the first `bytes` of a file as a raw Buffer. */
async function readHead(filePath: string, bytes: number): Promise<Buffer> {
  const stream = createReadStream(filePath, { start: 0, end: bytes - 1 })
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

/** Decompress just enough of a gzip file to show a text preview. */
async function gunzipPreview(filePath: string): Promise<string> {
  const source = createReadStream(filePath)
  const gunzip = createGunzip()
  source.pipe(gunzip)
  let preview = ''
  try {
    for await (const chunk of gunzip) {
      preview += (chunk as Buffer).toString('utf-8')
      if (preview.length >= SQL_PREVIEW_BYTES) break
    }
  } catch {
    /* a truncated decompression is fine — this is only a preview */
  } finally {
    source.destroy()
    gunzip.destroy()
  }
  return preview.slice(0, SQL_PREVIEW_BYTES)
}

/** Classify a picked dump file from its magic bytes, and build a preview. */
async function inspectSqlFile(filePath: string): Promise<{ kind: SqlImportKind; preview: string }> {
  const head = await readHead(filePath, SQL_PREVIEW_BYTES)
  if (head[0] === 0x1f && head[1] === 0x8b) {
    return { kind: 'gzip', preview: await gunzipPreview(filePath) }
  }
  if (head.subarray(0, 5).toString('latin1') === 'PGDMP') {
    return { kind: 'archive', preview: '' }
  }
  if (head.length > 262 && head.subarray(257, 262).toString('latin1') === 'ustar') {
    return { kind: 'archive', preview: '' }
  }
  return { kind: 'plain', preview: head.toString('utf-8') }
}

/** Handles native file dialogs — exporting results and importing CSV/JSON/SQL. */
export function registerFileHandlers(): void {
  ipcMain.handle(IpcChannels.fileExport, async (event, rawPayload) => {
    try {
      const payload = fileExportSchema.parse(rawPayload)
      const window = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.SaveDialogOptions = {
        defaultPath: payload.defaultName,
        filters: [
          { name: 'CSV', extensions: ['csv'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      }

      const { canceled, filePath } = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options)

      if (canceled || !filePath) return ok({ saved: false })

      await fs.writeFile(filePath, payload.content, 'utf-8')
      return ok({ saved: true, path: filePath })
    } catch (err) {
      return failFrom(err)
    }
  })

  ipcMain.handle(IpcChannels.fileOpen, async (event, rawPayload) => {
    try {
      const payload = fileOpenSchema.parse(rawPayload)
      const window = BrowserWindow.fromWebContents(event.sender)
      const filters: Record<'csv' | 'json' | 'sql', Electron.FileFilter> = {
        csv: { name: 'CSV', extensions: ['csv', 'tsv', 'txt'] },
        json: { name: 'JSON', extensions: ['json'] },
        sql: { name: 'SQL', extensions: ['sql'] }
      }
      const filter = filters[payload.format]
      const options: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: [filter, { name: 'All Files', extensions: ['*'] }]
      }

      const { canceled, filePaths } = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)

      if (canceled || filePaths.length === 0) return ok({ canceled: true })

      const filePath = filePaths[0]
      const content = await fs.readFile(filePath, 'utf-8')
      return ok({ canceled: false, name: basename(filePath), content })
    } catch (err) {
      return failFrom(err)
    }
  })

  // Picks a .sql dump and returns its path + metadata — never its contents,
  // so a multi-GB file can be streamed later instead of read into memory.
  ipcMain.handle(IpcChannels.fileOpenSql, async (event) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: [
          { name: 'SQL dump', extensions: ['sql', 'gz', 'dump', 'tar'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      }

      const { canceled, filePaths } = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)

      if (canceled || filePaths.length === 0) return ok({ canceled: true })

      const filePath = filePaths[0]
      const stat = await fs.stat(filePath)
      const { kind, preview } = await inspectSqlFile(filePath)
      return ok({
        canceled: false,
        path: filePath,
        name: basename(filePath),
        size: stat.size,
        preview,
        kind
      })
    } catch (err) {
      return failFrom(err)
    }
  })

  // Picks an SSH private-key file and returns just its absolute path — the key
  // bytes are read in the main process at connect time, never in the renderer.
  ipcMain.handle(IpcChannels.filePickKey, async (event) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        // SSH keys live in the ~/.ssh dotfolder and are usually extensionless
        // (id_rsa, id_ed25519, or named after the host/user). Default to
        // "All Files" so an extension filter doesn't grey them out on macOS.
        properties: ['openFile', 'showHiddenFiles'],
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'Private key', extensions: ['pem', 'key', 'ppk', 'rsa', 'ed25519', 'p8'] }
        ]
      }
      const { canceled, filePaths } = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      if (canceled || filePaths.length === 0) return ok({ canceled: true })
      return ok({ canceled: false, path: filePaths[0] })
    } catch (err) {
      return failFrom(err)
    }
  })

  // Native save dialog for a database export — returns the chosen path only.
  // The export job streams pg_dump/mysqldump straight to it; the dump (which
  // can be gigabytes) never crosses IPC.
  ipcMain.handle(IpcChannels.filePickSave, async (event, rawPayload) => {
    try {
      const defaultName = String(
        (rawPayload as { defaultName?: unknown } | null)?.defaultName ?? 'export.sql'
      )
      const window = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.SaveDialogOptions = {
        defaultPath: defaultName,
        filters: [
          { name: 'SQL dump', extensions: ['sql'] },
          { name: 'Compressed SQL', extensions: ['gz'] },
          { name: 'Postgres archive', extensions: ['dump'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      }
      const { canceled, filePath } = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options)
      if (canceled || !filePath) return ok({ canceled: true })
      return ok({ canceled: false, path: filePath })
    } catch (err) {
      return failFrom(err)
    }
  })
}
