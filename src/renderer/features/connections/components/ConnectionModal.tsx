import { useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { cn } from '@renderer/utils/cn'
import { ConnectionForm } from '@renderer/features/connections/components/ConnectionForm'
import { ENGINE_LABELS } from '@renderer/features/connections/constants'
import { useConnectionStore } from '@renderer/features/connections/stores/connectionStore'
import { useConnections } from '@renderer/features/connections/hooks/useConnections'
import {
  buildDraft,
  toUpdateChanges,
  validateDraft,
  type ConnectionFieldErrors
} from '@renderer/features/connections/utils'
import type { ConnectionInput } from '@shared/types/connection'

interface Feedback {
  kind: 'success' | 'error'
  message: string
}

/** The create/edit connection dialog. Owns draft state, validation and submit. */
export function ConnectionModal(): ReactNode {
  const open = useConnectionStore((s) => s.editorOpen)
  const target = useConnectionStore((s) => s.editorTarget)
  const closeEditor = useConnectionStore((s) => s.closeEditor)
  const { create, update, test } = useConnections()

  const isEdit = target !== null
  const [draft, setDraft] = useState<ConnectionInput>(() => buildDraft(target))
  const [errors, setErrors] = useState<ConnectionFieldErrors>({})
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  // Re-seed the form every time the modal opens (for a new target).
  useEffect(() => {
    if (!open) return
    setDraft(buildDraft(target))
    setErrors({})
    setFeedback(null)
    setTesting(false)
    setSaving(false)
  }, [open, target])

  if (!open) return null

  const patch = (changes: Partial<ConnectionInput>): void => {
    setDraft((prev) => ({ ...prev, ...changes }))
    setFeedback(null)
  }

  const handleTest = async (): Promise<void> => {
    const result = validateDraft(draft)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    if (isEdit && draft.password === '') {
      setFeedback({ kind: 'error', message: 'Enter the password to test this connection' })
      return
    }
    setTesting(true)
    setFeedback(null)
    const response = await test(result.data)
    setTesting(false)
    setFeedback(
      response.ok
        ? {
            kind: 'success',
            message: `Connected — ${response.data.serverVersion} · ${response.data.latencyMs} ms`
          }
        : { kind: 'error', message: response.error.message }
    )
  }

  const handleSave = async (): Promise<void> => {
    const result = validateDraft(draft)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setSaving(true)
    const response =
      isEdit && target
        ? await update(target.id, toUpdateChanges(result.data))
        : await create(result.data)
    setSaving(false)
    if (response.ok) closeEditor()
    else setFeedback({ kind: 'error', message: response.error.message })
  }

  return (
    <Modal
      open={open}
      onClose={closeEditor}
      title={isEdit ? 'Edit connection' : 'New connection'}
      description={
        isEdit
          ? 'Update the connection details below.'
          : `Connect to a ${ENGINE_LABELS[draft.engine]} database.`
      }
      width={500}
      footer={
        <>
          <Button variant="ghost" onClick={handleTest} loading={testing} disabled={saving}>
            Test connection
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={closeEditor} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving} disabled={testing}>
            {isEdit ? 'Save changes' : 'Create'}
          </Button>
        </>
      }
    >
      <ConnectionForm value={draft} errors={errors} isEdit={isEdit} onChange={patch} />

      {feedback && (
        <div
          className={cn(
            'mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
            feedback.kind === 'success'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-danger/30 bg-danger/10 text-danger'
          )}
        >
          {feedback.kind === 'success' ? (
            <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-px h-4 w-4 shrink-0" />
          )}
          <span className="break-words">{feedback.message}</span>
        </div>
      )}
    </Modal>
  )
}
