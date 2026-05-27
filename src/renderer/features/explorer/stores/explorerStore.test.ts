import { beforeEach, describe, expect, it } from 'vitest'
import { useExplorerStore } from '@renderer/features/explorer/stores/explorerStore'
import type { SchemaSnapshot } from '@shared/types/schema'

const SNAPSHOT: SchemaSnapshot = {
  schemas: ['public'],
  tables: [],
  views: [],
  materializedViews: [],
  functions: [],
  procedures: [],
  triggers: [],
  indexes: []
} as unknown as SchemaSnapshot

beforeEach(() => {
  useExplorerStore.setState({
    snapshots: {},
    loading: {},
    errors: {},
    expanded: new Set(),
    filter: ''
  })
})

describe('explorerStore — snapshot + status', () => {
  it('setSnapshot stores per-connection', () => {
    useExplorerStore.getState().setSnapshot('c1', SNAPSHOT)
    expect(useExplorerStore.getState().snapshots).toEqual({ c1: SNAPSHOT })
  })

  it('setLoading toggles a per-connection flag', () => {
    useExplorerStore.getState().setLoading('c1', true)
    expect(useExplorerStore.getState().loading.c1).toBe(true)
    useExplorerStore.getState().setLoading('c1', false)
    expect(useExplorerStore.getState().loading.c1).toBe(false)
  })

  it('setError sets a message, null clears it', () => {
    useExplorerStore.getState().setError('c1', 'boom')
    expect(useExplorerStore.getState().errors.c1).toBe('boom')
    useExplorerStore.getState().setError('c1', null)
    expect(useExplorerStore.getState().errors.c1).toBeUndefined()
  })

  it('clearConnection drops snapshot + loading + error in one call', () => {
    useExplorerStore.setState({
      snapshots: { c1: SNAPSHOT, c2: SNAPSHOT },
      loading: { c1: true },
      errors: { c1: 'x' }
    })
    useExplorerStore.getState().clearConnection('c1')
    const state = useExplorerStore.getState()
    expect(state.snapshots).toEqual({ c2: SNAPSHOT })
    expect(state.loading).toEqual({})
    expect(state.errors).toEqual({})
  })
})

describe('explorerStore — tree state', () => {
  it('toggleNode adds, then removes from the expanded set', () => {
    useExplorerStore.getState().toggleNode('group:public.tables')
    expect(useExplorerStore.getState().expanded.has('group:public.tables')).toBe(true)
    useExplorerStore.getState().toggleNode('group:public.tables')
    expect(useExplorerStore.getState().expanded.has('group:public.tables')).toBe(false)
  })

  it('expandNodes merges new ids without dropping prior ones', () => {
    useExplorerStore.getState().toggleNode('a')
    useExplorerStore.getState().expandNodes(['b', 'c'])
    expect([...useExplorerStore.getState().expanded].sort()).toEqual(['a', 'b', 'c'])
  })

  it('setFilter updates the filter string', () => {
    useExplorerStore.getState().setFilter('users')
    expect(useExplorerStore.getState().filter).toBe('users')
  })
})
