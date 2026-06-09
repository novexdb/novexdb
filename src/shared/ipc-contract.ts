import type { ConnectionInput, UpdateConnectionPayload } from '@shared/types/connection'
import type { Connection, ConnectionTestResult } from '@shared/types/connection'
import type { ActiveConnectionInfo } from '@shared/types/database'
import type { SchemaSnapshot } from '@shared/types/schema'
import type {
  CancelQueryPayload,
  CloneDone,
  CloneFailure,
  CloneProgress,
  ExecuteBatchPayload,
  ExecuteBatchResult,
  ExecuteQueryPayload,
  ExportContents,
  ExportDone,
  ExportFailure,
  ExportFormat,
  ExportProgress,
  FileExportPayload,
  FileExportResult,
  FileOpenPayload,
  FileOpenResult,
  QueryResultSet,
  SqlImportDone,
  SqlImportFailure,
  SqlImportPickResult,
  SqlImportProgress
} from '@shared/types/query'
import type { QueryHistoryEntry } from '@shared/types/history'
import type {
  TableDataPage,
  TableFetchPayload,
  TableMutatePayload,
  TableMutateResult
} from '@shared/types/table-data'
import type {
  AiChatMessage,
  AiSaveConfigPayload,
  AiStatus,
  AnalysisResult,
  AnalyzeDatabasePayload,
  ErrorExplainPayload,
  ErrorExplainResult,
  ExplainResult,
  ExplainSqlPayload,
  Nl2SqlPayload,
  Nl2SqlResult,
  OptimizeResult,
  OptimizeSqlPayload
} from '@shared/types/ai'
import type { AppSettings } from '@shared/types/settings'
import type { PersistedWorkspaceMap } from '@shared/schemas/workspaces.schema'
import type {
  UpdateCheckingInfo,
  UpdateErrorInfo,
  UpdateNotAvailableInfo,
  UpdateProgressInfo,
  UpdateStatusSnapshot,
  UpdateVersionInfo
} from '@shared/types/update'
import type {
  ScanCancelPayload,
  ScanProgress,
  ScanResult,
  ScanStartPayload
} from '@shared/types/intelligence'
import type {
  CascadeExecuteRequest,
  CascadeExecuteResult,
  CascadeScanRequest,
  CascadeScanResult
} from '@shared/types/cascade'
import type { IpcResult, Platform } from '@shared/types/ipc'

/** Callbacks for a streaming AI chat request (wired by the preload). */
export interface AiChatHandlers {
  onChunk: (delta: string) => void
  onDone: (text: string) => void
  onError: (error: string) => void
}

/** Callbacks for a streaming SQL-dump import (wired by the preload). */
export interface SqlImportHandlers {
  onProgress: (progress: SqlImportProgress) => void
  onDone: (done: SqlImportDone) => void
  onError: (failure: SqlImportFailure) => void
}

/** Callbacks for a streaming database export (wired by the preload). */
export interface DbExportHandlers {
  onProgress: (progress: ExportProgress) => void
  onDone: (done: ExportDone) => void
  onError: (failure: ExportFailure) => void
}

/** Callbacks for a streaming database clone (wired by the preload). */
export interface DbCloneHandlers {
  onProgress: (progress: CloneProgress) => void
  onDone: (done: CloneDone) => void
  onError: (failure: CloneFailure) => void
}

/** Callbacks for auto-update events (wired by the preload).
 *  `onChecking` / `onNotAvailable` are optional so existing call-sites
 *  (which only need available/progress/downloaded/error) don't need to
 *  supply no-op stubs. */
export interface UpdateHandlers {
  onChecking?: (info: UpdateCheckingInfo) => void
  onAvailable: (info: UpdateVersionInfo) => void
  onNotAvailable?: (info: UpdateNotAvailableInfo) => void
  onProgress: (info: UpdateProgressInfo) => void
  onDownloaded: (info: UpdateVersionInfo) => void
  onError: (info: UpdateErrorInfo) => void
}

/** Failure payload emitted by `intel:scan:error`. */
export interface ScanFailure {
  scanId: string
  connectionId: string
  status: 'cancelled' | 'error'
  message: string
}

/** Callbacks for an intelligence scan run (wired by the preload). */
export interface IntelligenceScanHandlers {
  onProgress: (progress: ScanProgress) => void
  onDone: (result: ScanResult) => void
  onError: (failure: ScanFailure) => void
}

/**
 * Canonical channel names. Importing this constant in preload, the main IPC
 * registrar, and tests keeps channels free of typos and drift.
 */
export const IpcChannels = {
  connectionsList: 'connections:list',
  connectionsCreate: 'connections:create',
  connectionsUpdate: 'connections:update',
  connectionsDelete: 'connections:delete',
  connectionsTest: 'connections:test',
  dbConnect: 'db:connect',
  dbDisconnect: 'db:disconnect',
  dbIntrospect: 'db:introspect',
  dbListDatabases: 'db:list-databases',
  dbCreateDatabase: 'db:create-database',
  dbSwitchDatabase: 'db:switch-database',
  dbActiveConnections: 'db:active-connections',
  dbScriptCreate: 'db:script-create',
  queryExecute: 'query:execute',
  queryCancel: 'query:cancel',
  queryBatch: 'query:batch',
  tableFetch: 'table:fetch',
  tableMutate: 'table:mutate',
  historyList: 'history:list',
  historyClear: 'history:clear',
  fileExport: 'file:export',
  fileOpen: 'file:open',
  fileOpenSql: 'file:open-sql',
  filePickKey: 'file:pick-key',
  filePickSave: 'file:pick-save',
  sqlImportStart: 'sql:import:start',
  sqlImportProgress: 'sql:import:progress',
  sqlImportDone: 'sql:import:done',
  sqlImportError: 'sql:import:error',
  sqlImportCancel: 'sql:import:cancel',
  dbExportStart: 'db:export:start',
  dbExportProgress: 'db:export:progress',
  dbExportDone: 'db:export:done',
  dbExportError: 'db:export:error',
  dbExportCancel: 'db:export:cancel',
  dbCloneStart: 'db:clone:start',
  dbCloneProgress: 'db:clone:progress',
  dbCloneDone: 'db:clone:done',
  dbCloneError: 'db:clone:error',
  dbCloneCancel: 'db:clone:cancel',
  aiStatus: 'ai:status',
  aiSaveConfig: 'ai:save-config',
  aiTest: 'ai:test',
  aiNl2sql: 'ai:nl2sql',
  aiExplain: 'ai:explain',
  aiOptimize: 'ai:optimize',
  aiErrorExplain: 'ai:error-explain',
  aiAnalyze: 'ai:analyze',
  aiChatStart: 'ai:chat:start',
  aiChatChunk: 'ai:chat:chunk',
  aiChatDone: 'ai:chat:done',
  aiChatError: 'ai:chat:error',
  aiChatCancel: 'ai:chat:cancel',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  workspacesGet: 'workspaces:get',
  workspacesSet: 'workspaces:set',
  windowMinimize: 'app:window:minimize',
  windowMaximize: 'app:window:maximize',
  windowClose: 'app:window:close',
  windowIsMaximized: 'app:window:is-maximized',
  windowIsFullScreen: 'app:window:is-fullscreen',
  windowFullScreenChanged: 'app:window:fullscreen-changed',
  windowOpenWithConnection: 'app:window:open-with-connection',
  appUpdateCheck: 'app:update:check',
  appUpdateInstall: 'app:update:install',
  appUpdateStatus: 'app:update:status',
  appUpdateReconfigure: 'app:update:reconfigure',
  appUpdateChecking: 'app:update:checking',
  appUpdateAvailable: 'app:update:available',
  appUpdateNotAvailable: 'app:update:not-available',
  appUpdateProgress: 'app:update:progress',
  appUpdateDownloaded: 'app:update:downloaded',
  appUpdateError: 'app:update:error',
  intelligenceScanStart: 'intel:scan:start',
  intelligenceScanCancel: 'intel:scan:cancel',
  intelligenceScanProgress: 'intel:scan:progress',
  intelligenceScanDone: 'intel:scan:done',
  intelligenceScanError: 'intel:scan:error',
  intelligenceLatest: 'intel:latest',
  intelligenceList: 'intel:list',
  intelligenceHistory: 'intel:history',
  cascadeScan: 'cascade:scan',
  cascadeExecute: 'cascade:execute'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

/**
 * The shape exposed on `window.api` by the preload script. This interface is
 * the typed surface the renderer programs against — the only door to main.
 */
export interface IpcApi {
  platform: Platform
  connections: {
    list: () => Promise<IpcResult<Connection[]>>
    create: (input: ConnectionInput) => Promise<IpcResult<Connection>>
    update: (payload: UpdateConnectionPayload) => Promise<IpcResult<Connection>>
    delete: (id: string) => Promise<IpcResult<null>>
    test: (input: ConnectionInput) => Promise<IpcResult<ConnectionTestResult>>
  }
  database: {
    connect: (connectionId: string) => Promise<IpcResult<ActiveConnectionInfo>>
    disconnect: (connectionId: string) => Promise<IpcResult<null>>
    introspect: (connectionId: string) => Promise<IpcResult<SchemaSnapshot>>
    /** Lists every database on the connected server. */
    listDatabases: (connectionId: string) => Promise<IpcResult<string[]>>
    /** Creates a new database on the connected server. */
    createDatabase: (payload: { connectionId: string; name: string }) => Promise<IpcResult<null>>
    /** Re-points the connection to a different database; returns the updated record. */
    switchDatabase: (payload: {
      connectionId: string
      database: string
    }) => Promise<IpcResult<Connection>>
    /** Ids of every connection with a live pool open in the main process. */
    activeConnections: () => Promise<IpcResult<string[]>>
    /** The CREATE TABLE/VIEW DDL for a relation — engine-specific under the hood. */
    scriptCreate: (payload: {
      connectionId: string
      schema: string
      table: string
    }) => Promise<IpcResult<string>>
    /** Streams a whole-database dump to a file; returns a cancel function. */
    exportDump: (
      payload: {
        connectionId: string
        path: string
        format: ExportFormat
        contents: ExportContents
      },
      handlers: DbExportHandlers
    ) => () => void
    /** Clones the source DB into a target DB/connection; returns a cancel function. */
    cloneDatabase: (
      payload: {
        sourceConnectionId: string
        targetConnectionId: string
        targetDatabase: string
      },
      handlers: DbCloneHandlers
    ) => () => void
  }
  query: {
    execute: (payload: ExecuteQueryPayload) => Promise<IpcResult<QueryResultSet>>
    cancel: (payload: CancelQueryPayload) => Promise<IpcResult<null>>
    /** Runs statements in one transaction — used for DDL and bulk inserts. */
    batch: (payload: ExecuteBatchPayload) => Promise<IpcResult<ExecuteBatchResult>>
  }
  table: {
    fetch: (payload: TableFetchPayload) => Promise<IpcResult<TableDataPage>>
    mutate: (payload: TableMutatePayload) => Promise<IpcResult<TableMutateResult>>
  }
  history: {
    list: () => Promise<IpcResult<QueryHistoryEntry[]>>
    clear: () => Promise<IpcResult<null>>
  }
  file: {
    export: (payload: FileExportPayload) => Promise<IpcResult<FileExportResult>>
    /** Opens a native dialog and reads the picked CSV/JSON file. */
    open: (payload: FileOpenPayload) => Promise<IpcResult<FileOpenResult>>
    /** Picks a .sql dump — returns its path (not contents) for streaming. */
    openSql: () => Promise<IpcResult<SqlImportPickResult>>
    /** Picks an SSH private-key file and returns its absolute path (not content). */
    pickKey: () => Promise<IpcResult<{ canceled: boolean; path?: string }>>
    /** Native save dialog for an export; returns the chosen path (never writes). */
    pickSave: (payload: {
      defaultName: string
    }) => Promise<IpcResult<{ canceled: boolean; path?: string }>>
  }
  sql: {
    /** Streams a .sql dump into the database; returns a cancel function. */
    importDump: (
      payload: { connectionId: string; path: string },
      handlers: SqlImportHandlers
    ) => () => void
  }
  ai: {
    status: () => Promise<IpcResult<AiStatus>>
    saveConfig: (payload: AiSaveConfigPayload) => Promise<IpcResult<AiStatus>>
    test: () => Promise<IpcResult<null>>
    nl2sql: (payload: Nl2SqlPayload) => Promise<IpcResult<Nl2SqlResult>>
    explain: (payload: ExplainSqlPayload) => Promise<IpcResult<ExplainResult>>
    optimize: (payload: OptimizeSqlPayload) => Promise<IpcResult<OptimizeResult>>
    explainError: (payload: ErrorExplainPayload) => Promise<IpcResult<ErrorExplainResult>>
    analyze: (payload: AnalyzeDatabasePayload) => Promise<IpcResult<AnalysisResult>>
    /** Streaming chat — returns a cancel function. */
    streamChat: (
      payload: { connectionId: string; messages: AiChatMessage[] },
      handlers: AiChatHandlers
    ) => () => void
  }
  settings: {
    get: () => Promise<IpcResult<AppSettings>>
    set: (patch: Partial<AppSettings>) => Promise<IpcResult<AppSettings>>
  }
  workspaces: {
    /** Read the persisted per-database tab state. */
    get: () => Promise<IpcResult<PersistedWorkspaceMap>>
    /** Overwrite the persisted map — renderer pushes the whole snapshot. */
    set: (workspaces: PersistedWorkspaceMap) => Promise<IpcResult<PersistedWorkspaceMap>>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    isFullScreen: () => Promise<boolean>
    /** Subscribe to fullscreen enter/leave events; returns an unsubscribe fn. */
    subscribeFullScreen: (handler: (isFullScreen: boolean) => void) => () => void
    /** Open a new main window with the given saved connection pre-activated. */
    openWithConnection: (connectionId: string) => Promise<void>
  }
  update: {
    /** Trigger an out-of-band update check (Settings → "Check now" button). */
    check: () => Promise<IpcResult<null>>
    /** Quit and install a downloaded update. The only path that ever restarts. */
    install: () => Promise<IpcResult<null>>
    /** Read the updater's current outcome + config — drives the Settings UI. */
    status: () => Promise<IpcResult<UpdateStatusSnapshot>>
    /** Re-pull config from settings + env after the user changes a preference. */
    reconfigure: () => Promise<IpcResult<null>>
    /** Subscribe to auto-update events; returns an unsubscribe function. */
    subscribe: (handlers: UpdateHandlers) => () => void
  }
  intelligence: {
    /** Kick off a scan; returns the scanId. Progress lands via `subscribe`. */
    startScan: (payload: ScanStartPayload) => Promise<IpcResult<{ scanId: string }>>
    /** Cancel an in-flight scan by id. */
    cancelScan: (payload: ScanCancelPayload) => Promise<IpcResult<null>>
    /** The most recent persisted scan result for a connection, or null. */
    latest: (connectionId: string) => Promise<IpcResult<ScanResult | null>>
    /** Every persisted scan result, across every connection. */
    list: () => Promise<IpcResult<ScanResult[]>>
    /** Newest-first scan history for a single connection — drives the trend charts. */
    history: (connectionId: string) => Promise<IpcResult<ScanResult[]>>
    /** Subscribe to scan progress/done/error events; returns an unsubscribe. */
    subscribe: (handlers: IntelligenceScanHandlers) => () => void
  }
  cascade: {
    /** Walk the FK graph from one or more root rows. Returns the dependency tree. */
    scan: (payload: CascadeScanRequest) => Promise<IpcResult<CascadeScanResult>>
    /** Execute a confirmed cascade delete (children-first, single transaction). */
    execute: (payload: CascadeExecuteRequest) => Promise<IpcResult<CascadeExecuteResult>>
  }
}
