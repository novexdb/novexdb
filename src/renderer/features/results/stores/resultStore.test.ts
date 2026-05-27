import { beforeEach, describe, expect, it } from 'vitest'
import { useResultStore } from '@renderer/features/results/stores/resultStore'
import type { QueryResultSet } from '@shared/types/query'

function makeResult(): QueryResultSet {
  return {
    columns: [{ name: 'id', dataTypeId: 0 }],
    rows: [[1]],
    rowCount: 1,
    durationMs: 1,
    truncated: false
  } as unknown as QueryResultSet
}

beforeEach(() => {
  useResultStore.setState({
    status: 'idle',
    result: null,
    error: null,
    runningQueryId: null,
    ranSql: null,
    panelTab: 'results',
    sortColumn: null,
    sortDir: 'asc'
  })
})

describe('resultStore — startRun', () => {
  it('flips status to running, stashes id + sql, clears stale result + sort', () => {
    useResultStore.setState({ result: makeResult(), sortColumn: 1 })
    useResultStore.getState().startRun('q1', 'SELECT 1')
    const s = useResultStore.getState()
    expect(s.status).toBe('running')
    expect(s.runningQueryId).toBe('q1')
    expect(s.ranSql).toBe('SELECT 1')
    expect(s.result).toBeNull()
    expect(s.sortColumn).toBeNull()
  })
})

describe('resultStore — finishSuccess', () => {
  it('sets data + success, clears running id', () => {
    useResultStore.setState({ status: 'running', runningQueryId: 'q1' })
    useResultStore.getState().finishSuccess(makeResult())
    const s = useResultStore.getState()
    expect(s.status).toBe('success')
    expect(s.result).not.toBeNull()
    expect(s.runningQueryId).toBeNull()
  })
})

describe('resultStore — finishError', () => {
  it('sets error + status, clears running id', () => {
    useResultStore.setState({ status: 'running', runningQueryId: 'q1' })
    useResultStore.getState().finishError('bad')
    const s = useResultStore.getState()
    expect(s.status).toBe('error')
    expect(s.error).toBe('bad')
    expect(s.runningQueryId).toBeNull()
  })
})

describe('resultStore — setPanelTab', () => {
  it('switches the active panel tab', () => {
    useResultStore.getState().setPanelTab('history')
    expect(useResultStore.getState().panelTab).toBe('history')
  })
})

describe('resultStore — toggleSort', () => {
  it('first call sorts the column asc', () => {
    useResultStore.getState().toggleSort(2)
    expect(useResultStore.getState()).toMatchObject({ sortColumn: 2, sortDir: 'asc' })
  })

  it('second call on the same column flips to desc', () => {
    useResultStore.getState().toggleSort(2)
    useResultStore.getState().toggleSort(2)
    expect(useResultStore.getState()).toMatchObject({ sortColumn: 2, sortDir: 'desc' })
  })

  it('third call on the same column clears the sort', () => {
    useResultStore.getState().toggleSort(2)
    useResultStore.getState().toggleSort(2)
    useResultStore.getState().toggleSort(2)
    expect(useResultStore.getState().sortColumn).toBeNull()
  })

  it('switching to a different column resets to asc', () => {
    useResultStore.getState().toggleSort(2)
    useResultStore.getState().toggleSort(2) // desc
    useResultStore.getState().toggleSort(5)
    expect(useResultStore.getState()).toMatchObject({ sortColumn: 5, sortDir: 'asc' })
  })
})
