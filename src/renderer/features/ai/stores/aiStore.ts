import { create } from 'zustand'
import { ipc } from '@renderer/services/ipc'
import type { AiStatus } from '@shared/types/ai'
import type { AiMessage } from '@renderer/features/ai/types'

interface AiState {
  messages: AiMessage[]
  status: AiStatus | null
  /** Cancels the in-flight streaming chat, if any. */
  chatCancel: (() => void) | null

  loadStatus: () => Promise<void>
  setStatus: (status: AiStatus) => void
  addMessage: (message: AiMessage) => void
  updateMessage: (id: string, updater: (message: AiMessage) => AiMessage) => void
  setChatCancel: (cancel: (() => void) | null) => void
  clear: () => void
}

/** Holds the AI conversation and provider status. */
export const useAiStore = create<AiState>((set) => ({
  messages: [],
  status: null,
  chatCancel: null,

  loadStatus: async () => {
    const result = await ipc.ai.status()
    if (result.ok) set({ status: result.data })
  },

  setStatus: (status) => set({ status }),

  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

  updateMessage: (id, updater) =>
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === id ? updater(message) : message
      )
    })),

  setChatCancel: (chatCancel) => set({ chatCancel }),

  clear: () => set({ messages: [] })
}))
