import { useId, type ReactNode } from 'react'
import { KeyRound } from 'lucide-react'
import { Field } from '@renderer/components/Field'
import { Input } from '@renderer/components/Input'
import { Select } from '@renderer/components/Select'
import { Button } from '@renderer/components/Button'
import { cn } from '@renderer/utils/cn'
import { ipc } from '@renderer/services/ipc'
import { EngineIcon } from '@renderer/features/connections/components/EngineIcon'
import {
  ALL_ENGINES,
  CONNECTION_COLORS,
  DEFAULT_PORTS,
  DEFAULT_SSH_CONFIG,
  DEFAULT_SSH_PORT,
  ENGINE_LABELS,
  ENGINE_OPTION_DEFAULTS,
  ENGINE_PLACEHOLDERS,
  SSH_AUTH_OPTIONS,
  SSL_OPTIONS,
  SUPPORTED_ENGINES
} from '@renderer/features/connections/constants'
import type { ConnectionFieldErrors } from '@renderer/features/connections/utils'
import type {
  ConnectionInput,
  ConnectionOptions,
  DatabaseEngine,
  SshAuthMethod,
  SshConfig,
  SslMode
} from '@shared/types/connection'

interface ConnectionFormProps {
  value: ConnectionInput
  errors: ConnectionFieldErrors
  isEdit: boolean
  onChange: (patch: Partial<ConnectionInput>) => void
}

/** Presentational, fully-controlled connection form. State lives in ConnectionModal. */
export function ConnectionForm({
  value,
  errors,
  isEdit,
  onChange
}: ConnectionFormProps): ReactNode {
  const nameId = useId()
  const engineId = useId()
  const sslId = useId()
  const hostId = useId()
  const portId = useId()
  const databaseId = useId()
  const usernameId = useId()
  const passwordId = useId()
  const encryptId = useId()
  const trustCertId = useId()
  const timeoutId = useId()
  const sshEnabledId = useId()
  const sshHostId = useId()
  const sshPortId = useId()
  const sshUserId = useId()
  const sshAuthId = useId()
  const sshPasswordId = useId()
  const sshPassphraseId = useId()

  const placeholders = ENGINE_PLACEHOLDERS[value.engine]
  const isMssql = value.engine === 'mssql'

  const handleEngineChange = (engine: DatabaseEngine): void => {
    onChange({
      engine,
      port: DEFAULT_PORTS[engine],
      // Switching engines wipes the previous engine's options to avoid carrying
      // postgres-shaped state into a SQL Server config (or vice versa).
      options: ENGINE_OPTION_DEFAULTS[engine]
    })
  }

  const patchOptions = (changes: Partial<ConnectionOptions>): void => {
    onChange({ options: { ...(value.options ?? {}), ...changes } })
  }

  const mssqlOptions = isMssql
    ? { ...ENGINE_OPTION_DEFAULTS.mssql, ...(value.options ?? {}) }
    : null

  const ssh = value.ssh ?? DEFAULT_SSH_CONFIG
  const patchSsh = (changes: Partial<SshConfig>): void => {
    onChange({ ssh: { ...ssh, ...changes } })
  }
  const chooseKey = async (): Promise<void> => {
    const result = await ipc.file.pickKey()
    if (result.ok && !result.data.canceled && result.data.path) {
      patchSsh({ privateKeyPath: result.data.path })
    }
  }
  const keyName = ssh.privateKeyPath ? ssh.privateKeyPath.split(/[\\/]/).pop() : null

  return (
    <div className="flex flex-col gap-3">
      <Field label="Connection name" htmlFor={nameId} error={errors.name}>
        <Input
          id={nameId}
          autoFocus
          value={value.name}
          placeholder="My database"
          invalid={Boolean(errors.name)}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Engine" htmlFor={engineId} error={errors.engine}>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            >
              <EngineIcon engine={value.engine} className="h-4 w-4" />
            </span>
            <Select
              id={engineId}
              value={value.engine}
              className="pl-8"
              onChange={(event) => handleEngineChange(event.target.value as DatabaseEngine)}
            >
              {ALL_ENGINES.map((engine) => {
                const supported = SUPPORTED_ENGINES.includes(engine)
                return (
                  <option key={engine} value={engine} disabled={!supported}>
                    {ENGINE_LABELS[engine]}
                    {supported ? '' : ' — soon'}
                  </option>
                )
              })}
            </Select>
          </div>
        </Field>
        {!isMssql && (
          <Field label="SSL mode" htmlFor={sslId}>
            <Select
              id={sslId}
              value={value.ssl}
              onChange={(event) => onChange({ ssl: event.target.value as SslMode })}
            >
              {SSL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Host" htmlFor={hostId} error={errors.host} className="col-span-2">
          <Input
            id={hostId}
            value={value.host}
            placeholder="localhost"
            invalid={Boolean(errors.host)}
            onChange={(event) => onChange({ host: event.target.value })}
          />
        </Field>
        <Field label="Port" htmlFor={portId} error={errors.port}>
          <Input
            id={portId}
            type="number"
            value={value.port}
            invalid={Boolean(errors.port)}
            onChange={(event) => onChange({ port: event.target.valueAsNumber || 0 })}
          />
        </Field>
      </div>

      <Field label="Database" htmlFor={databaseId} error={errors.database}>
        <Input
          id={databaseId}
          value={value.database}
          placeholder={placeholders.database}
          invalid={Boolean(errors.database)}
          onChange={(event) => onChange({ database: event.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Username" htmlFor={usernameId} error={errors.username}>
          <Input
            id={usernameId}
            value={value.username}
            placeholder={placeholders.username}
            invalid={Boolean(errors.username)}
            onChange={(event) => onChange({ username: event.target.value })}
          />
        </Field>
        <Field
          label="Password"
          htmlFor={passwordId}
          error={errors.password}
          hint={isEdit ? 'Leave blank to keep current' : undefined}
        >
          <Input
            id={passwordId}
            type="password"
            value={value.password}
            invalid={Boolean(errors.password)}
            onChange={(event) => onChange({ password: event.target.value })}
          />
        </Field>
      </div>

      <div className="rounded-md border border-line bg-surface/40 p-3">
        <label
          htmlFor={sshEnabledId}
          className="flex items-center gap-2 text-xs font-medium text-content"
        >
          <input
            id={sshEnabledId}
            type="checkbox"
            checked={ssh.enabled}
            onChange={(event) => patchSsh({ enabled: event.target.checked })}
            className="h-3.5 w-3.5 rounded border-line-strong text-accent focus:ring-accent"
          />
          Connect over SSH
        </label>

        {ssh.enabled && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              <Field
                label="SSH host"
                htmlFor={sshHostId}
                error={errors.ssh?.host}
                className="col-span-2"
              >
                <Input
                  id={sshHostId}
                  value={ssh.host}
                  placeholder="bastion.example.com"
                  invalid={Boolean(errors.ssh?.host)}
                  onChange={(event) => patchSsh({ host: event.target.value })}
                />
              </Field>
              <Field label="SSH port" htmlFor={sshPortId} error={errors.ssh?.port}>
                <Input
                  id={sshPortId}
                  type="number"
                  value={ssh.port}
                  invalid={Boolean(errors.ssh?.port)}
                  onChange={(event) =>
                    patchSsh({ port: event.target.valueAsNumber || DEFAULT_SSH_PORT })
                  }
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="SSH username" htmlFor={sshUserId} error={errors.ssh?.username}>
                <Input
                  id={sshUserId}
                  value={ssh.username}
                  placeholder="ubuntu"
                  invalid={Boolean(errors.ssh?.username)}
                  onChange={(event) => patchSsh({ username: event.target.value })}
                />
              </Field>
              <Field label="Authentication" htmlFor={sshAuthId}>
                <Select
                  id={sshAuthId}
                  value={ssh.authMethod}
                  onChange={(event) =>
                    patchSsh({ authMethod: event.target.value as SshAuthMethod })
                  }
                >
                  {SSH_AUTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {ssh.authMethod === 'password' ? (
              <Field
                label="SSH password"
                htmlFor={sshPasswordId}
                hint={isEdit ? 'Leave blank to keep current' : undefined}
              >
                <Input
                  id={sshPasswordId}
                  type="password"
                  value={ssh.password ?? ''}
                  onChange={(event) => patchSsh({ password: event.target.value })}
                />
              </Field>
            ) : (
              <>
                <Field label="Private key" error={errors.ssh?.privateKeyPath}>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={chooseKey}>
                      <KeyRound className="h-3.5 w-3.5" />
                      Choose key…
                    </Button>
                    <span
                      className="min-w-0 flex-1 truncate text-xs text-muted"
                      title={ssh.privateKeyPath}
                    >
                      {keyName ?? 'No key selected'}
                    </span>
                  </div>
                </Field>
                <Field
                  label="Key passphrase"
                  htmlFor={sshPassphraseId}
                  hint={
                    isEdit
                      ? 'Leave blank to keep current / if none'
                      : 'Optional — only if the key is encrypted'
                  }
                >
                  <Input
                    id={sshPassphraseId}
                    type="password"
                    value={ssh.passphrase ?? ''}
                    onChange={(event) => patchSsh({ passphrase: event.target.value })}
                  />
                </Field>
              </>
            )}
          </div>
        )}
      </div>

      {isMssql && mssqlOptions && (
        <div className="rounded-md border border-line bg-surface/40 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            SQL Server options
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label htmlFor={encryptId} className="flex items-center gap-2 text-xs text-content">
              <input
                id={encryptId}
                type="checkbox"
                checked={mssqlOptions.encrypt}
                onChange={(event) => patchOptions({ encrypt: event.target.checked })}
                className="h-3.5 w-3.5 rounded border-line-strong text-accent focus:ring-accent"
              />
              Encrypt connection
            </label>
            <label htmlFor={trustCertId} className="flex items-center gap-2 text-xs text-content">
              <input
                id={trustCertId}
                type="checkbox"
                checked={mssqlOptions.trustServerCertificate}
                onChange={(event) => patchOptions({ trustServerCertificate: event.target.checked })}
                className="h-3.5 w-3.5 rounded border-line-strong text-accent focus:ring-accent"
              />
              Trust server certificate
            </label>
          </div>
          <div className="mt-3">
            <Field label="Connection timeout (ms)" htmlFor={timeoutId}>
              <Input
                id={timeoutId}
                type="number"
                min={1000}
                max={600000}
                step={1000}
                value={mssqlOptions.connectionTimeoutMs}
                onChange={(event) =>
                  patchOptions({
                    connectionTimeoutMs: event.target.valueAsNumber || 15_000
                  })
                }
              />
            </Field>
          </div>
        </div>
      )}

      <Field label="Color">
        <div className="flex gap-2">
          {CONNECTION_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Use color ${color}`}
              onClick={() => onChange({ color })}
              style={{ backgroundColor: color }}
              className={cn(
                'h-6 w-6 rounded-full transition-transform hover:scale-110',
                value.color === color && 'ring-2 ring-accent ring-offset-2 ring-offset-elevated'
              )}
            />
          ))}
        </div>
      </Field>
    </div>
  )
}
