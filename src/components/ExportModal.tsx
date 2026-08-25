import type { Item } from '../lib/types.ts'
import {
  dateStamp,
  downloadCSV,
  downloadXLSX,
  fullReportRows,
  returnListRows,
  returnStats,
} from '../lib/report.ts'
import { Modal } from './Modal.tsx'

interface ExportModalProps {
  items: Item[]
  onClose: () => void
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

export function ExportModal({ items, onClose }: ExportModalProps) {
  const now = new Date()
  const stamp = dateStamp(now)
  const stats = returnStats(items)

  return (
    <Modal title="Export" onClose={onClose}>
      <section className="export-block">
        <h3>Full audit report</h3>
        <p className="muted">
          All {items.length} items with expiry bucket and current status.
        </p>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() => downloadCSV(fullReportRows(items, now), `expiry-audit-report-${stamp}.csv`)}
          >
            Download CSV
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void downloadXLSX(fullReportRows(items, now), `expiry-audit-report-${stamp}.xlsx`, 'Audit Report')
            }
          >
            Download Excel
          </button>
        </div>
      </section>

      <section className="export-block">
        <h3>Return to Distributor</h3>
        {stats.count > 0 ? (
          <p className="muted">
            {stats.count} removed item{stats.count === 1 ? '' : 's'} · total qty {stats.totalQty}
            {stats.totalValue > 0 && <> · PTR value ₹{inr.format(stats.totalValue)}</>}
          </p>
        ) : (
          <p className="muted">
            No items are marked Removed yet. Tap &ldquo;✕ Removed&rdquo; on the items you pull off
            the shelf, then export this list for your distributor.
          </p>
        )}
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            disabled={stats.count === 0}
            onClick={() => downloadCSV(returnListRows(items, now), `return-to-distributor-${stamp}.csv`)}
          >
            Download CSV
          </button>
          <button
            type="button"
            className="btn"
            disabled={stats.count === 0}
            onClick={() =>
              void downloadXLSX(returnListRows(items, now), `return-to-distributor-${stamp}.xlsx`, 'Return List')
            }
          >
            Download Excel
          </button>
        </div>
      </section>
    </Modal>
  )
}
