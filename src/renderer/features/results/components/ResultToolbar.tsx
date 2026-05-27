import type { ReactNode } from 'react'
import { Copy, Download } from 'lucide-react'
import { Button } from '@renderer/components/Button'
import { Dropdown } from '@renderer/components/Dropdown'
import { ipc } from '@renderer/services/ipc'
import { useResultStore } from '@renderer/features/results/stores/resultStore'
import { toCsv, toJson } from '@renderer/features/results/utils/export'

/** Copy / export actions for the current result set. */
export function ResultToolbar(): ReactNode {
  const result = useResultStore((s) => s.result)
  if (!result || result.columns.length === 0) return null

  const copy = (text: string): void => void navigator.clipboard.writeText(text)
  const save = (defaultName: string, content: string): void => {
    void ipc.file.export({ defaultName, content })
  }

  return (
    <div className="flex items-center gap-1">
      <Dropdown
        trigger={
          <Button size="sm" variant="ghost">
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
        }
        items={[
          { label: 'Copy as CSV', onSelect: () => copy(toCsv(result.columns, result.rows)) },
          { label: 'Copy as JSON', onSelect: () => copy(toJson(result.columns, result.rows)) }
        ]}
      />
      <Dropdown
        trigger={
          <Button size="sm" variant="ghost">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        }
        items={[
          {
            label: 'Export as CSV',
            onSelect: () => save('result.csv', toCsv(result.columns, result.rows))
          },
          {
            label: 'Export as JSON',
            onSelect: () => save('result.json', toJson(result.columns, result.rows))
          }
        ]}
      />
    </div>
  )
}
