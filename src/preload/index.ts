import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannels } from '@shared/ipc-contract'
import type { IpcApi } from '@shared/ipc-contract'
import type { AiChatChunk, AiChatDone, AiChatFailure } from '@shared/types/ai'
import type {
  CloneDone,
  CloneFailure,
  CloneProgress,
  ExportDone,
  ExportFailure,
  ExportProgress,
  SqlImportDone,
  SqlImportFailure,
  SqlImportProgress
} from '@shared/types/query'
import type {
  UpdateCheckingInfo,
  UpdateErrorInfo,
  UpdateNotAvailableInfo,
  UpdateProgressInfo,
  UpdateVersionInfo
} from '@shared/types/update'
import type { ScanFailure } from '@shared/ipc-contract'
import type { ScanProgress, ScanResult } from '@shared/types/intelligence'
import type { Platform } from '@shared/types/ipc'

/**
 * The single, typed bridge between renderer and main. Context isolation is on,
 * so the renderer cannot reach `ipcRenderer` directly — it may only call the
 * vetted functions assembled here and exposed as `window.api`.
 */
const api: IpcApi = {
  platform: process.platform as Platform,
  connections: {
    list: () => ipcRenderer.invoke(IpcChannels.connectionsList),
    create: (input) => ipcRenderer.invoke(IpcChannels.connectionsCreate, input),
    update: (payload) => ipcRenderer.invoke(IpcChannels.connectionsUpdate, payload),
    delete: (id) => ipcRenderer.invoke(IpcChannels.connectionsDelete, id),
    test: (input) => ipcRenderer.invoke(IpcChannels.connectionsTest, input)
  },
  database: {
    connect: (id) => ipcRenderer.invoke(IpcChannels.dbConnect, id),
    disconnect: (id) => ipcRenderer.invoke(IpcChannels.dbDisconnect, id),
    introspect: (id) => ipcRenderer.invoke(IpcChannels.dbIntrospect, id),
    listDatabases: (id) => ipcRenderer.invoke(IpcChannels.dbListDatabases, id),
    createDatabase: (payload) => ipcRenderer.invoke(IpcChannels.dbCreateDatabase, payload),
    switchDatabase: (payload) => ipcRenderer.invoke(IpcChannels.dbSwitchDatabase, payload),
    activeConnections: () => ipcRenderer.invoke(IpcChannels.dbActiveConnections),
    scriptCreate: (payload) => ipcRenderer.invoke(IpcChannels.dbScriptCreate, payload),
    exportDump: (payload, handlers) => {
      const exportId = crypto.randomUUID()

      const onProgress = (_event: IpcRendererEvent, data: ExportProgress): void => {
        if (data.exportId === exportId) handlers.onProgress(data)
      }
      const onDone = (_event: IpcRendererEvent, data: ExportDone): void => {
        if (data.exportId !== exportId) return
        cleanup()
        handlers.onDone(data)
      }
      const onError = (_event: IpcRendererEvent, data: ExportFailure): void => {
        if (data.exportId !== exportId) return
        cleanup()
        handlers.onError(data)
      }
      function cleanup(): void {
        ipcRenderer.removeListener(IpcChannels.dbExportProgress, onProgress)
        ipcRenderer.removeListener(IpcChannels.dbExportDone, onDone)
        ipcRenderer.removeListener(IpcChannels.dbExportError, onError)
      }

      ipcRenderer.on(IpcChannels.dbExportProgress, onProgress)
      ipcRenderer.on(IpcChannels.dbExportDone, onDone)
      ipcRenderer.on(IpcChannels.dbExportError, onError)
      ipcRenderer.send(IpcChannels.dbExportStart, { exportId, ...payload })

      return () => {
        cleanup()
        ipcRenderer.send(IpcChannels.dbExportCancel, { exportId })
      }
    },
    cloneDatabase: (payload, handlers) => {
      const cloneId = crypto.randomUUID()

      const onProgress = (_event: IpcRendererEvent, data: CloneProgress): void => {
        if (data.cloneId === cloneId) handlers.onProgress(data)
      }
      const onDone = (_event: IpcRendererEvent, data: CloneDone): void => {
        if (data.cloneId !== cloneId) return
        cleanup()
        handlers.onDone(data)
      }
      const onError = (_event: IpcRendererEvent, data: CloneFailure): void => {
        if (data.cloneId !== cloneId) return
        cleanup()
        handlers.onError(data)
      }
      function cleanup(): void {
        ipcRenderer.removeListener(IpcChannels.dbCloneProgress, onProgress)
        ipcRenderer.removeListener(IpcChannels.dbCloneDone, onDone)
        ipcRenderer.removeListener(IpcChannels.dbCloneError, onError)
      }

      ipcRenderer.on(IpcChannels.dbCloneProgress, onProgress)
      ipcRenderer.on(IpcChannels.dbCloneDone, onDone)
      ipcRenderer.on(IpcChannels.dbCloneError, onError)
      ipcRenderer.send(IpcChannels.dbCloneStart, { cloneId, ...payload })

      return () => {
        cleanup()
        ipcRenderer.send(IpcChannels.dbCloneCancel, { cloneId })
      }
    }
  },
  query: {
    execute: (payload) => ipcRenderer.invoke(IpcChannels.queryExecute, payload),
    cancel: (payload) => ipcRenderer.invoke(IpcChannels.queryCancel, payload),
    batch: (payload) => ipcRenderer.invoke(IpcChannels.queryBatch, payload)
  },
  table: {
    fetch: (payload) => ipcRenderer.invoke(IpcChannels.tableFetch, payload),
    mutate: (payload) => ipcRenderer.invoke(IpcChannels.tableMutate, payload)
  },
  history: {
    list: () => ipcRenderer.invoke(IpcChannels.historyList),
    clear: () => ipcRenderer.invoke(IpcChannels.historyClear)
  },
  file: {
    export: (payload) => ipcRenderer.invoke(IpcChannels.fileExport, payload),
    open: (payload) => ipcRenderer.invoke(IpcChannels.fileOpen, payload),
    openSql: () => ipcRenderer.invoke(IpcChannels.fileOpenSql),
    pickKey: () => ipcRenderer.invoke(IpcChannels.filePickKey),
    pickSave: (payload) => ipcRenderer.invoke(IpcChannels.filePickSave, payload)
  },
  sql: {
    importDump: (payload, handlers) => {
      const importId = crypto.randomUUID()

      const onProgress = (_event: IpcRendererEvent, data: SqlImportProgress): void => {
        if (data.importId === importId) handlers.onProgress(data)
      }
      const onDone = (_event: IpcRendererEvent, data: SqlImportDone): void => {
        if (data.importId !== importId) return
        cleanup()
        handlers.onDone(data)
      }
      const onError = (_event: IpcRendererEvent, data: SqlImportFailure): void => {
        if (data.importId !== importId) return
        cleanup()
        handlers.onError(data)
      }
      function cleanup(): void {
        ipcRenderer.removeListener(IpcChannels.sqlImportProgress, onProgress)
        ipcRenderer.removeListener(IpcChannels.sqlImportDone, onDone)
        ipcRenderer.removeListener(IpcChannels.sqlImportError, onError)
      }

      ipcRenderer.on(IpcChannels.sqlImportProgress, onProgress)
      ipcRenderer.on(IpcChannels.sqlImportDone, onDone)
      ipcRenderer.on(IpcChannels.sqlImportError, onError)
      ipcRenderer.send(IpcChannels.sqlImportStart, {
        importId,
        connectionId: payload.connectionId,
        path: payload.path,
        clean: payload.clean ?? false
      })

      return () => {
        cleanup()
        ipcRenderer.send(IpcChannels.sqlImportCancel, { importId })
      }
    }
  },
  ai: {
    status: () => ipcRenderer.invoke(IpcChannels.aiStatus),
    saveConfig: (payload) => ipcRenderer.invoke(IpcChannels.aiSaveConfig, payload),
    test: () => ipcRenderer.invoke(IpcChannels.aiTest),
    nl2sql: (payload) => ipcRenderer.invoke(IpcChannels.aiNl2sql, payload),
    explain: (payload) => ipcRenderer.invoke(IpcChannels.aiExplain, payload),
    optimize: (payload) => ipcRenderer.invoke(IpcChannels.aiOptimize, payload),
    explainError: (payload) => ipcRenderer.invoke(IpcChannels.aiErrorExplain, payload),
    analyze: (payload) => ipcRenderer.invoke(IpcChannels.aiAnalyze, payload),
    streamChat: (payload, handlers) => {
      const streamId = crypto.randomUUID()

      const onChunk = (_event: IpcRendererEvent, data: AiChatChunk): void => {
        if (data.streamId === streamId) handlers.onChunk(data.delta)
      }
      const onDone = (_event: IpcRendererEvent, data: AiChatDone): void => {
        if (data.streamId !== streamId) return
        cleanup()
        handlers.onDone(data.text)
      }
      const onError = (_event: IpcRendererEvent, data: AiChatFailure): void => {
        if (data.streamId !== streamId) return
        cleanup()
        handlers.onError(data.error)
      }
      function cleanup(): void {
        ipcRenderer.removeListener(IpcChannels.aiChatChunk, onChunk)
        ipcRenderer.removeListener(IpcChannels.aiChatDone, onDone)
        ipcRenderer.removeListener(IpcChannels.aiChatError, onError)
      }

      ipcRenderer.on(IpcChannels.aiChatChunk, onChunk)
      ipcRenderer.on(IpcChannels.aiChatDone, onDone)
      ipcRenderer.on(IpcChannels.aiChatError, onError)
      ipcRenderer.send(IpcChannels.aiChatStart, {
        streamId,
        connectionId: payload.connectionId,
        messages: payload.messages
      })

      return () => {
        cleanup()
        ipcRenderer.send(IpcChannels.aiChatCancel, { streamId })
      }
    }
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannels.settingsGet),
    set: (patch) => ipcRenderer.invoke(IpcChannels.settingsSet, patch)
  },
  workspaces: {
    get: () => ipcRenderer.invoke(IpcChannels.workspacesGet),
    set: (workspaces) => ipcRenderer.invoke(IpcChannels.workspacesSet, workspaces)
  },
  window: {
    minimize: () => ipcRenderer.invoke(IpcChannels.windowMinimize),
    maximize: () => ipcRenderer.invoke(IpcChannels.windowMaximize),
    close: () => ipcRenderer.invoke(IpcChannels.windowClose),
    isMaximized: () => ipcRenderer.invoke(IpcChannels.windowIsMaximized),
    isFullScreen: () => ipcRenderer.invoke(IpcChannels.windowIsFullScreen),
    openWithConnection: (id) => ipcRenderer.invoke(IpcChannels.windowOpenWithConnection, id),
    subscribeFullScreen: (handler) => {
      const listener = (_event: IpcRendererEvent, isFullScreen: boolean): void =>
        handler(isFullScreen)
      ipcRenderer.on(IpcChannels.windowFullScreenChanged, listener)
      return () => ipcRenderer.removeListener(IpcChannels.windowFullScreenChanged, listener)
    }
  },
  update: {
    check: () => ipcRenderer.invoke(IpcChannels.appUpdateCheck),
    install: () => ipcRenderer.invoke(IpcChannels.appUpdateInstall),
    status: () => ipcRenderer.invoke(IpcChannels.appUpdateStatus),
    reconfigure: () => ipcRenderer.invoke(IpcChannels.appUpdateReconfigure),
    subscribe: (handlers) => {
      const onChecking = (_event: IpcRendererEvent, data: UpdateCheckingInfo): void =>
        handlers.onChecking?.(data)
      const onAvailable = (_event: IpcRendererEvent, data: UpdateVersionInfo): void =>
        handlers.onAvailable(data)
      const onNotAvailable = (_event: IpcRendererEvent, data: UpdateNotAvailableInfo): void =>
        handlers.onNotAvailable?.(data)
      const onProgress = (_event: IpcRendererEvent, data: UpdateProgressInfo): void =>
        handlers.onProgress(data)
      const onDownloaded = (_event: IpcRendererEvent, data: UpdateVersionInfo): void =>
        handlers.onDownloaded(data)
      const onError = (_event: IpcRendererEvent, data: UpdateErrorInfo): void =>
        handlers.onError(data)

      ipcRenderer.on(IpcChannels.appUpdateChecking, onChecking)
      ipcRenderer.on(IpcChannels.appUpdateAvailable, onAvailable)
      ipcRenderer.on(IpcChannels.appUpdateNotAvailable, onNotAvailable)
      ipcRenderer.on(IpcChannels.appUpdateProgress, onProgress)
      ipcRenderer.on(IpcChannels.appUpdateDownloaded, onDownloaded)
      ipcRenderer.on(IpcChannels.appUpdateError, onError)

      return () => {
        ipcRenderer.removeListener(IpcChannels.appUpdateChecking, onChecking)
        ipcRenderer.removeListener(IpcChannels.appUpdateAvailable, onAvailable)
        ipcRenderer.removeListener(IpcChannels.appUpdateNotAvailable, onNotAvailable)
        ipcRenderer.removeListener(IpcChannels.appUpdateProgress, onProgress)
        ipcRenderer.removeListener(IpcChannels.appUpdateDownloaded, onDownloaded)
        ipcRenderer.removeListener(IpcChannels.appUpdateError, onError)
      }
    }
  },
  intelligence: {
    startScan: (payload) => ipcRenderer.invoke(IpcChannels.intelligenceScanStart, payload),
    cancelScan: (payload) => ipcRenderer.invoke(IpcChannels.intelligenceScanCancel, payload),
    latest: (connectionId) => ipcRenderer.invoke(IpcChannels.intelligenceLatest, connectionId),
    list: () => ipcRenderer.invoke(IpcChannels.intelligenceList),
    history: (connectionId) => ipcRenderer.invoke(IpcChannels.intelligenceHistory, connectionId),
    subscribe: (handlers) => {
      const onProgress = (_event: IpcRendererEvent, data: ScanProgress): void =>
        handlers.onProgress(data)
      const onDone = (_event: IpcRendererEvent, data: ScanResult): void => handlers.onDone(data)
      const onError = (_event: IpcRendererEvent, data: ScanFailure): void => handlers.onError(data)

      ipcRenderer.on(IpcChannels.intelligenceScanProgress, onProgress)
      ipcRenderer.on(IpcChannels.intelligenceScanDone, onDone)
      ipcRenderer.on(IpcChannels.intelligenceScanError, onError)

      return () => {
        ipcRenderer.removeListener(IpcChannels.intelligenceScanProgress, onProgress)
        ipcRenderer.removeListener(IpcChannels.intelligenceScanDone, onDone)
        ipcRenderer.removeListener(IpcChannels.intelligenceScanError, onError)
      }
    }
  },
  cascade: {
    scan: (payload) => ipcRenderer.invoke(IpcChannels.cascadeScan, payload),
    execute: (payload) => ipcRenderer.invoke(IpcChannels.cascadeExecute, payload)
  }
}

contextBridge.exposeInMainWorld('api', api)
