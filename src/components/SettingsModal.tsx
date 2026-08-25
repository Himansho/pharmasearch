import type { LastImport } from '../lib/types.ts'
import { FIELD_DEFS, type ColumnMapping } from '../lib/mapping.ts'
import { Modal } from './Modal.tsx'

interface SettingsModalProps {
  mapping: ColumnMapping | null
  lastImport: LastImport | null
  canEditMapping: boolean
  onEditMapping: () => void
  onClearAll: () => void
  onClose: () => void
}

export function SettingsModal({
  mapping,
  lastImport,
  canEditMapping,
  onEditMapping,
  onClearAll,
  onClose,
}: SettingsModalProps) {
  return (
    <Modal title="Settings" onClose={onClose}>
      <section className="export-block">
        <h3>Column mapping</h3>
        {mapping ? (
          <ul className="mapping-list">
            {FIELD_DEFS.map((def) => (
              <li key={def.key}>
                <span>{def.label}</span>
                <span className={mapping[def.key] ? '' : 'muted'}>
                  {mapping[def.key] ?? 'Not mapped'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No mapping saved yet — it is created on your first import.</p>
        )}
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            disabled={!canEditMapping}
            onClick={() => {
              onClose()
              onEditMapping()
            }}
          >
            Edit mapping
          </button>
        </div>
        {lastImport && (
          <p className="muted small">
            Last import: {lastImport.fileName} ·{' '}
            {new Date(lastImport.at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        )}
      </section>

      <section className="export-block">
        <h3>Your data</h3>
        <p className="muted">
          Everything — imported items, statuses, and this mapping — is stored only in this
          browser on this device. Nothing is uploaded to any server. Clearing browser data or
          switching devices will lose it, so export a report periodically as your backup.
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn-danger" onClick={onClearAll}>
            Clear all data
          </button>
        </div>
      </section>
    </Modal>
  )
}
