import { useEffect, useId, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { Input } from '@renderer/components/Input'
import { cn } from '@renderer/utils/cn'
import { ConnectionForm } from '@renderer/features/connections/components/ConnectionForm'
import { parseConnectionUrl } from '@renderer/features/connections/url-import'
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
  const [urlInput, setUrlInput] = useState('')
  const importId = useId()

  // Re-seed the form every time the modal opens (for a new target).
  useEffect(() => {
    if (!open) return
    setDraft(buildDraft(target))
    setErrors({})
    setFeedback(null)
    setTesting(false)
    setSaving(false)
    setUrlInput('')
  }, [open, target])

  if (!open) return null

  const patch = (changes: Partial<ConnectionInput>): void => {
    setDraft((prev) => ({ ...prev, ...changes }))
    setFeedback(null)
  }

  const handleImport = (): void => {
    const result = parseConnectionUrl(urlInput)
    if (!result.ok) {
      setFeedback({ kind: 'error', message: result.error })
      return
    }
    setDraft((prev) => ({ ...prev, ...result.value }))
    setErrors({})
    setFeedback({
      kind: 'success',
      message: 'Imported — review the fields below, then Test or Create.'
    })
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
    if (
      isEdit &&
      draft.ssh?.enabled &&
      draft.ssh.authMethod === 'password' &&
      (draft.ssh.password ?? '') === ''
    ) {
      setFeedback({ kind: 'error', message: 'Enter the SSH password to test this connection' })
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
      {!isEdit && (
        <div className="mb-4 rounded-md border border-line bg-surface/40 p-3">
          <label
            htmlFor={importId}
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted"
          >
            Import from URL
          </label>
          <div className="flex items-center gap-2">
            <Input
              id={importId}
              value={urlInput}
              placeholder="postgresql+ssh://user@bastion/user:pass@host/db?name=…"
              onChange={(event) => setUrlInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleImport()
                }
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleImport}
              disabled={!urlInput.trim()}
            >
              Import
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">
            Paste a TablePlus-style connection URL to fill in the form below.
          </p>
        </div>
      )}

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
