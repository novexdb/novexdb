import { beforeEach, describe, expect, it } from 'vitest'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import type { Connection } from '@shared/types/connection'

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'local',
    engine: 'postgres',
    host: 'localhost',
    port: 5432,
    database: 'app',
    username: 'postgres',
    ssl: 'disable',
    color: '#4f8cff',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  }
}

beforeEach(() => {
  useConnectionStore.setState({
    connections: [],
    statuses: {},
    activeConnectionId: null,
    loaded: false,
    editorOpen: false,
    editorTarget: null
  })
})

describe('connectionStore — setConnections', () => {
  it('replaces the whole list', () => {
    const a = makeConnection({ id: 'a' })
    const b = makeConnection({ id: 'b' })
    useConnectionStore.getState().setConnections([a, b])
    expect(useConnectionStore.getState().connections).toEqual([a, b])
  })
})

describe('connectionStore — upsertConnection', () => {
  it('appends a new connection', () => {
    const a = makeConnection({ id: 'a' })
    useConnectionStore.getState().upsertConnection(a)
    expect(useConnectionStore.getState().connections).toEqual([a])
  })

  it('replaces an existing connection by id', () => {
    const a = makeConnection({ id: 'a', name: 'old' })
    const updated = makeConnection({ id: 'a', name: 'new' })
    useConnectionStore.setState({ connections: [a] })
    useConnectionStore.getState().upsertConnection(updated)
    expect(useConnectionStore.getState().connections).toEqual([updated])
  })
})

describe('connectionStore — removeConnection', () => {
  it('drops the connection, its status, and clears active if it matched', () => {
    const a = makeConnection({ id: 'a' })
    const b = makeConnection({ id: 'b' })
    useConnectionStore.setState({
      connections: [a, b],
      statuses: { a: 'connected', b: 'disconnected' },
      activeConnectionId: 'a'
    })
    useConnectionStore.getState().removeConnection('a')
    const state = useConnectionStore.getState()
    expect(state.connections).toEqual([b])
    expect(state.statuses).toEqual({ b: 'disconnected' })
    expect(state.activeConnectionId).toBeNull()
  })

  it('leaves activeConnectionId alone when removing a different connection', () => {
    const a = makeConnection({ id: 'a' })
    const b = makeConnection({ id: 'b' })
    useConnectionStore.setState({ connections: [a, b], activeConnectionId: 'a' })
    useConnectionStore.getState().removeConnection('b')
    expect(useConnectionStore.getState().activeConnectionId).toBe('a')
  })
})

describe('connectionStore — setStatus', () => {
  it('updates a single connection status', () => {
    useConnectionStore.getState().setStatus('a', 'connecting')
    expect(useConnectionStore.getState().statuses).toEqual({ a: 'connecting' })
  })
})

describe('connectionStore — setActive', () => {
  it('updates the active id, accepts null', () => {
    useConnectionStore.getState().setActive('a')
    expect(useConnectionStore.getState().activeConnectionId).toBe('a')
    useConnectionStore.getState().setActive(null)
    expect(useConnectionStore.getState().activeConnectionId).toBeNull()
  })
})

describe('connectionStore — editor modal state', () => {
  it('openEditor(null) puts the modal in create mode', () => {
    useConnectionStore.getState().openEditor(null)
    expect(useConnectionStore.getState().editorOpen).toBe(true)
    expect(useConnectionStore.getState().editorTarget).toBeNull()
  })

  it('openEditor(connection) puts the modal in edit mode', () => {
    const a = makeConnection({ id: 'a' })
    useConnectionStore.getState().openEditor(a)
    expect(useConnectionStore.getState().editorOpen).toBe(true)
    expect(useConnectionStore.getState().editorTarget).toEqual(a)
  })

  it('closeEditor clears modal state', () => {
    useConnectionStore.setState({ editorOpen: true, editorTarget: makeConnection() })
    useConnectionStore.getState().closeEditor()
    expect(useConnectionStore.getState().editorOpen).toBe(false)
    expect(useConnectionStore.getState().editorTarget).toBeNull()
  })
})
