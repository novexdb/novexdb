import { useEffect, useState, type ReactNode } from 'react'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { formatCellValue, isNull } from '@renderer/features/results/utils/format-cell'
import type { TableColumn } from '@shared/types/table-data'

export interface CellEditorTarget {
  rowKey: string
  /** Set when the target is a staged new row — drives editNewRow vs editExisting. */
  tempId: string | null
  column: TableColumn
  value: unknown
}

interface CellEditorModalProps {
  target: CellEditorTarget
  onSave: (value: unknown) => void
  onClose: () => void
}

/**
 * Quick Look Editor — a roomy textarea for cells whose value doesn't fit on
 * one row. Hands the new value to `onSave`; the parent stages it through the
 * table-data store.
 */
export function CellEditorModal({ target, onSave, onClose }: CellEditorModalProps): ReactNode {
  const { column, value } = target
  const [draft, setDraft] = useState<string>(isNull(value) ? '' : formatCellValue(value))
  const [setToNull, setSetToNull] = useState<boolean>(isNull(value))

  // Reset draft when the modal swaps targets (e.g. user closes one Quick Look
  // and opens another without unmounting in between).
  useEffect(() => {
    setDraft(isNull(value) ? '' : formatCellValue(value))
    setSetToNull(isNull(value))
  }, [target.rowKey, target.column.name, value])

  const handleSave = (): void => {
    if (setToNull) {
      onSave(null)
    } else if (draft === '' && column.nullable) {
      // Match coerceInput: empty + nullable column → null.
      onSave(null)
    } else {
      onSave(draft)
    }
    onClose()
  }

  const canNull = column.nullable

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${column.name}`}
      description={column.dataType}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <textarea
          autoFocus
          value={setToNull ? '' : draft}
          disabled={setToNull}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          rows={10}
          placeholder={setToNull ? 'NULL' : ''}
          className="block w-full rounded-md border border-line bg-app px-3 py-2 font-mono text-[12px] leading-relaxed text-content outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:text-subtle"
        />

        <label
          className={`flex items-center gap-2 text-xs ${canNull ? 'text-content' : 'text-subtle'}`}
        >
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-accent"
            checked={setToNull}
            disabled={!canNull}
            onChange={(event) => setSetToNull(event.target.checked)}
          />
          Set to NULL
          {!canNull && <span className="text-subtle">(column is NOT NULL)</span>}
        </label>
      </div>
    </Modal>
  )
}
