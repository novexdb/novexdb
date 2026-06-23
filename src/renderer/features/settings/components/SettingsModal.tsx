import { useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { Field } from '@renderer/components/Field'
import { Input } from '@renderer/components/Input'
import { Select } from '@renderer/components/Select'
import { ipc } from '@renderer/services/ipc'
import { useUiStore } from '@renderer/stores/uiStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { useAiStore } from '@renderer/features/ai/stores/aiStore'
import type { AiProvider } from '@shared/types/ai'
import type { UpdateStatusSnapshot } from '@shared/types/update'

interface ModelOption {
  id: string
  label: string
}

const PROVIDERS: { id: AiProvider; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic Claude' },
  { id: 'openai', label: 'OpenAI GPT' },
  { id: 'gemini', label: 'Google Gemini' }
]

/**
 * Model lineups per provider. First entry of each list is treated as the
 * default when the user switches providers and `aiModel` from the saved
 * settings doesn't belong to the new lineup.
 */
const MODELS_BY_PROVIDER: Record<AiProvider, ModelOption[]> = {
  anthropic: [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — balanced (recommended)' },
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — most capable' },
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 — previous generation' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fastest' }
  ],
  openai: [
    { id: 'gpt-5-mini', label: 'GPT-5 mini — balanced (recommended)' },
    { id: 'gpt-5', label: 'GPT-5 — most capable' },
    { id: 'gpt-5-nano', label: 'GPT-5 nano — fastest' }
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — balanced (recommended)' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — most capable' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite — fastest' }
  ]
}

/** Per-provider hint copy for the API-key field. */
const KEY_HINTS: Record<AiProvider, { placeholder: string; envVar: string }> = {
  anthropic: { placeholder: 'sk-ant-…', envVar: 'ANTHROPIC_API_KEY' },
  openai: { placeholder: 'sk-…', envVar: 'OPENAI_API_KEY' },
  gemini: { placeholder: 'AIza…', envVar: 'GEMINI_API_KEY' }
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok' }
  | { status: 'error'; message: string }

/** App settings dialog. The AI section configures the provider, model and key. */
export function SettingsModal(): ReactNode {
  const open = useUiStore((s) => s.settingsOpen)
  const close = useUiStore((s) => s.closeSettings)
  const aiStatus = useAiStore((s) => s.status)

  const [provider, setProvider] = useState<AiProvider>('anthropic')
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  // The persisted key belongs to whichever provider was active when it
  // was saved. If the user has swapped provider since, the stored key is
  // for the *other* one — so we don't show the reassuring "(saved)" hint.
  const savedKeyProvider = aiStatus?.provider

  // Update preferences — mirror the persisted settings so the controls feel
  // instant; the underlying writes are debounced via persist-on-change.
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.update)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusSnapshot | null>(null)
  const [checking, setChecking] = useState(false)

  const refreshUpdateStatus = async (): Promise<void> => {
    const result = await ipc.update.status()
    if (result.ok) setUpdateStatus(result.data)
  }

  useEffect(() => {
    if (!open) return
    const persisted = useSettingsStore.getState().settings
    setProvider(persisted.aiProvider)
    setModel(persisted.aiModel)
    setApiKey('')
    setTest({ status: 'idle' })
    void useAiStore.getState().loadStatus()
    void refreshUpdateStatus()
  }, [open])

  /**
   * When the user picks a different provider, snap the model to that
   * provider's recommended one. If their saved model already belongs to
   * the new provider's lineup (unlikely on first switch, possible after
   * a previous round-trip) we leave it alone.
   */
  const handleProviderChange = (next: AiProvider): void => {
    setProvider(next)
    const lineup = MODELS_BY_PROVIDER[next]
    const stillValid = lineup.some((m) => m.id === model)
    if (!stillValid) setModel(lineup[0]?.id ?? '')
    // The previously saved key belongs to the previously selected
    // provider, so the test-result indicator (Connected/Error) is no
    // longer meaningful — reset it.
    setTest({ status: 'idle' })
  }

  // Subscribe to live update events so the panel reflects the in-flight scan.
  useEffect(() => {
    if (!open) return
    return ipc.update.subscribe({
      onChecking: () => void refreshUpdateStatus(),
      onAvailable: () => void refreshUpdateStatus(),
      onNotAvailable: () => void refreshUpdateStatus(),
      onProgress: () => void refreshUpdateStatus(),
      onDownloaded: () => void refreshUpdateStatus(),
      onError: () => void refreshUpdateStatus()
    })
  }, [open])

  const setUpdatePref = async (
    patch: Partial<{
      autoUpdateEnabled: boolean
      allowPrerelease: boolean
      updateCheckIntervalMinutes: number
    }>
  ): Promise<void> => {
    await updateSettings(patch)
    // The main process reads settings on reconfigure, so push the change through.
    await ipc.update.reconfigure()
    await refreshUpdateStatus()
  }

  const handleCheckNow = async (): Promise<void> => {
    setChecking(true)
    await ipc.update.check()
    setChecking(false)
    void refreshUpdateStatus()
  }

  if (!open) return null

  const persist = async (): Promise<boolean> => {
    const result = await ipc.ai.saveConfig({
      provider,
      model,
      apiKey: apiKey.trim() || undefined
    })
    if (result.ok) {
      useAiStore.getState().setStatus(result.data)
      void useSettingsStore.getState().load()
    }
    return result.ok
  }

  const handleTest = async (): Promise<void> => {
    setTest({ status: 'testing' })
    await persist()
    const result = await ipc.ai.test()
    setApiKey('')
    setTest(
      result.ok ? { status: 'ok' } : { status: 'error', message: result.error.message }
    )
    void useAiStore.getState().loadStatus()
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    const ok = await persist()
    setSaving(false)
    if (ok) close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Settings"
      description="Configure the AI copilot."
      width={480}
      footer={
        <>
          <span className="flex-1" />
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          AI Copilot
        </p>

        <Field label="Provider">
          <Select
            value={provider}
            onChange={(event) => handleProviderChange(event.target.value as AiProvider)}
          >
            {PROVIDERS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Model">
          <Select value={model} onChange={(event) => setModel(event.target.value)}>
            {MODELS_BY_PROVIDER[provider].map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="API key"
          hint={
            aiStatus?.configured && savedKeyProvider === provider
              ? `A key is saved for ${PROVIDERS.find((p) => p.id === provider)?.label}. Leave blank to keep it; encrypted with the OS keychain.`
              : `Stored encrypted with the OS keychain. Also reads ${KEY_HINTS[provider].envVar}. Switching provider replaces the saved key on the next save.`
          }
        >
          <Input
            type="password"
            value={apiKey}
            placeholder={
              aiStatus?.configured && savedKeyProvider === provider
                ? '•••••••••••• (saved)'
                : KEY_HINTS[provider].placeholder
            }
            onChange={(event) => setApiKey(event.target.value)}
          />
        </Field>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTest}
            loading={test.status === 'testing'}
          >
            Test connection
          </Button>
          {test.status === 'ok' && (
            <span className="flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Connected
            </span>
          )}
          {test.status === 'error' && (
            <span className="flex items-center gap-1 text-xs text-danger">
              <AlertCircle className="h-3.5 w-3.5" /> {test.message}
            </span>
          )}
          {test.status === 'testing' && (
            <span className="flex items-center gap-1 text-xs text-subtle">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing…
            </span>
          )}
        </div>

        <hr className="my-2 border-line" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          Updates
        </p>

        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-content">Check for updates automatically</span>
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-accent"
            checked={settings.autoUpdateEnabled}
            onChange={(event) =>
              void setUpdatePref({ autoUpdateEnabled: event.target.checked })
            }
          />
        </label>

        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-content">Include pre-release channels</span>
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-accent"
            checked={settings.allowPrerelease}
            onChange={(event) =>
              void setUpdatePref({ allowPrerelease: event.target.checked })
            }
          />
        </label>

        <Field label="Check interval">
          <Select
            value={String(settings.updateCheckIntervalMinutes)}
            disabled={!settings.autoUpdateEnabled}
            onChange={(event) =>
              void setUpdatePref({
                updateCheckIntervalMinutes: Number(event.target.value)
              })
            }
          >
            <option value="15">Every 15 minutes</option>
            <option value="60">Every hour (recommended)</option>
            <option value="240">Every 4 hours</option>
            <option value="720">Twice a day</option>
            <option value="1440">Once a day</option>
          </Select>
        </Field>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCheckNow}
            loading={checking}
            disabled={!updateStatus?.packaged}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Check now
          </Button>
          <UpdateStatusLine status={updateStatus} />
        </div>
      </div>
    </Modal>
  )
}

/** One-line, severity-aware summary of the updater's current state. */
function UpdateStatusLine({ status }: { status: UpdateStatusSnapshot | null }): ReactNode {
  if (!status) return null
  if (!status.packaged) {
    return (
      <span className="text-xs text-subtle">Dev build — updater is inert.</span>
    )
  }
  const outcome = status.outcome
  switch (outcome.status) {
    case 'idle':
      return <span className="text-xs text-subtle">Idle.</span>
    case 'checking':
      return (
        <span className="flex items-center gap-1 text-xs text-subtle">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
        </span>
      )
    case 'up-to-date':
      return (
        <span className="flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" /> You're up to date.
        </span>
      )
    case 'available':
      return (
        <span className="text-xs text-accent">
          {outcome.version} available — downloading…
        </span>
      )
    case 'downloading':
      return (
        <span className="text-xs text-accent">
          Downloading {outcome.version} · {outcome.percent}%
        </span>
      )
    case 'ready':
      return (
        <span className="text-xs text-success">
          {outcome.version} downloaded — restart to install.
        </span>
      )
    case 'error':
      return (
        <span className="flex items-center gap-1 text-xs text-danger">
          <AlertCircle className="h-3.5 w-3.5" /> {outcome.message}
        </span>
      )
  }
}
