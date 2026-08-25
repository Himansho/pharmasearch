import { memo, useDeferredValue, useMemo, useState } from 'react'
import { STATUS_LABELS, type Item, type LastImport, type Status } from '../lib/types.ts'
import {
  BUCKET_ORDER,
  bucketForItem,
  formatExpiry,
  type BucketId,
} from '../lib/expiry.ts'
import type { ColumnMapping } from '../lib/mapping.ts'
import { ExportModal } from './ExportModal.tsx'
import { SettingsModal } from './SettingsModal.tsx'

interface DashboardProps {
  items: Item[]
  lastImport: LastImport | null
  banner: string | null
  onDismissBanner: () => void
  onStatus: (id: string, status: Status) => void
  onImportClick: () => void
  mapping: ColumnMapping | null
  canEditMapping: boolean
  onEditMapping: () => void
  onClearAll: () => void
  onCatalog: () => void
}

const ACCENT: Record<BucketId, string> = {
  expired: 'acc-critical',
  thisMonth: 'acc-serious',
  nextMonth: 'acc-warning',
  next3: 'acc-amber',
  next6: 'acc-neutral',
  next12: 'acc-neutral',
  beyond12: 'acc-good',
  needsReview: 'acc-review',
}

const DISPLAY_CAP = 100

type StatusFilter = 'all' | Status

function expirySortKey(item: Item): number {
  if (item.expiryMonth == null || item.expiryYear == null) return Number.MAX_SAFE_INTEGER
  return item.expiryYear * 12 + item.expiryMonth
}

const ItemRow = memo(function ItemRow({
  item,
  bucket,
  onStatus,
}: {
  item: Item
  bucket: BucketId
  onStatus: (id: string, status: Status) => void
}) {
  const meta = [
    item.batchNo && `Batch ${item.batchNo}`,
    item.company,
    item.quantity != null && `Qty ${item.quantity}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const expiry =
    bucket === 'needsReview'
      ? item.expiryRaw
        ? `Expiry unreadable: “${item.expiryRaw}”`
        : 'Expiry missing'
      : `Expires: ${formatExpiry(item.expiryMonth as number, item.expiryYear as number)}`

  return (
    <li className={`item-row st-${item.status}`}>
      <div className="item-info">
        <div className="item-name">{item.itemName}</div>
        {meta && <div className="item-meta">{meta}</div>}
        <div className="item-expiry">{expiry}</div>
      </div>
      <div className="status-seg" role="group" aria-label={`Status for ${item.itemName}`}>
        {(['pending', 'checked', 'removed'] as Status[]).map((s) => (
          <button
            key={s}
            type="button"
            className={`seg seg-${s}${item.status === s ? ' active' : ''}`}
            aria-pressed={item.status === s}
            onClick={() => onStatus(item.id, s)}
          >
            {s === 'checked' ? '✓ ' : s === 'removed' ? '✕ ' : ''}
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>
    </li>
  )
})

export function Dashboard({
  items,
  lastImport,
  banner,
  onDismissBanner,
  onStatus,
  onImportClick,
  mapping,
  canEditMapping,
  onEditMapping,
  onClearAll,
  onCatalog,
}: DashboardProps) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    expired: true,
    thisMonth: true,
  })
  const [limits, setLimits] = useState<Record<string, number>>({})
  const [modal, setModal] = useState<'none' | 'export' | 'settings'>('none')

  // A stable "now" per month so memoized grouping doesn't churn; buckets are
  // month-granular (PRD §7), so within a month this never goes stale.
  const today = new Date()
  const monthKey = `${today.getFullYear()}-${today.getMonth()}`
  const now = useMemo(() => new Date(), [monthKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const filterActive = deferredQuery.trim() !== '' || statusFilter !== 'all'

  const groups = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    const map = new Map<BucketId, Item[]>(BUCKET_ORDER.map((b) => [b.id, []]))
    for (const item of items) {
      if (q && !item.itemName.toLowerCase().includes(q) && !item.batchNo.toLowerCase().includes(q)) {
        continue
      }
      if (statusFilter !== 'all' && item.status !== statusFilter) continue
      map.get(bucketForItem(item, now))?.push(item)
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) => expirySortKey(a) - expirySortKey(b) || a.itemName.localeCompare(b.itemName),
      )
    }
    return map
  }, [items, deferredQuery, statusFilter, now])

  const matchCount = useMemo(
    () => [...groups.values()].reduce((sum, list) => sum + list.length, 0),
    [groups],
  )

  const statusCounts = useMemo(() => {
    const c: Record<Status, number> = { pending: 0, checked: 0, removed: 0 }
    for (const item of items) c[item.status]++
    return c
  }, [items])

  const audited = statusCounts.checked + statusCounts.removed
  const pct = items.length > 0 ? Math.round((audited / items.length) * 100) : 0

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  return (
    <div className="screen dashboard">
      <header className="topbar">
        <div className="topbar-row">
          <h1>Pharmacy expiry audit</h1>
          <div className="topbar-actions">
            <button type="button" className="btn btn-small" onClick={onImportClick}>
              Import
            </button>
            <button type="button" className="btn btn-small" onClick={onCatalog}>
              Catalog
            </button>
            <button type="button" className="btn btn-small" onClick={() => setModal('export')}>
              Export
            </button>
            <button
              type="button"
              className="btn btn-small btn-icon"
              aria-label="Settings"
              onClick={() => setModal('settings')}
            >
              ⚙
            </button>
          </div>
        </div>
        <p className="topbar-sub">
          {items.length} items
          {lastImport && ` · imported ${fmtDate(lastImport.at)} from ${lastImport.fileName}`}
        </p>
        <div className="progress-wrap">
          <div className="progress-line" role="presentation">
            <div style={{ width: `${pct}%` }} />
          </div>
          <span className="progress-caption">
            {audited} of {items.length} audited
          </span>
        </div>
        <input
          type="search"
          className="search"
          placeholder="Search medicines or batch…"
          aria-label="Search items by name or batch"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips" role="group" aria-label="Filter by status">
          {(['all', 'pending', 'checked', 'removed'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`chip${statusFilter === f ? ' active' : ''}`}
              aria-pressed={statusFilter === f}
              onClick={() => setStatusFilter(f)}
            >
              {f === 'all' ? `All ${items.length}` : `${STATUS_LABELS[f]} ${statusCounts[f]}`}
            </button>
          ))}
        </div>
      </header>

      {banner && (
        <div className="banner" role="status">
          <span>{banner}</span>
          <button type="button" aria-label="Dismiss" onClick={onDismissBanner}>
            ✕
          </button>
        </div>
      )}

      {filterActive && matchCount === 0 && (
        <p className="empty-note">No items match{deferredQuery.trim() && ` “${deferredQuery.trim()}”`}.</p>
      )}

      {BUCKET_ORDER.map((bucket) => {
        const list = groups.get(bucket.id) ?? []
        if (bucket.id === 'needsReview' && list.length === 0) return null
        if (filterActive && list.length === 0) return null
        const open = filterActive ? list.length > 0 : (expanded[bucket.id] ?? false)
        const done = list.filter((i) => i.status !== 'pending').length
        const limit = limits[bucket.id] ?? DISPLAY_CAP
        const shown = list.slice(0, limit)
        return (
          <section key={bucket.id} className={`bucket ${ACCENT[bucket.id]}`}>
            <button
              type="button"
              className={`bucket-head${open ? ' open' : ''}`}
              aria-expanded={open}
              disabled={list.length === 0}
              onClick={() =>
                setExpanded((prev) => ({ ...prev, [bucket.id]: !(prev[bucket.id] ?? false) }))
              }
            >
              <span className="bucket-dot" aria-hidden="true" />
              <span className="bucket-label">{bucket.label}</span>
              {done > 0 && (
                <span className="bucket-progress">
                  {done}/{list.length} done
                </span>
              )}
              <span className="bucket-count">{list.length}</span>
              <span className={`chev${open ? ' rot' : ''}`} aria-hidden="true">
                ▾
              </span>
            </button>
            {open && list.length > 0 && (
              <div className="bucket-body">
                {bucket.id === 'needsReview' && (
                  <p className="bucket-note">
                    These rows had an expiry the app couldn&apos;t read, so they aren&apos;t in any
                    time bucket. Fix the expiry in your POS software and re-import, or check them
                    by hand.
                  </p>
                )}
                <ul className="item-list">
                  {shown.map((item) => (
                    <ItemRow key={item.id} item={item} bucket={bucket.id} onStatus={onStatus} />
                  ))}
                </ul>
                {list.length > shown.length && (
                  <button
                    type="button"
                    className="btn btn-ghost show-more"
                    onClick={() =>
                      setLimits((prev) => ({ ...prev, [bucket.id]: list.length }))
                    }
                  >
                    Show all {list.length} items
                  </button>
                )}
              </div>
            )}
          </section>
        )
      })}

      <p className="footer-note">
        All data stays on this device only — export a report as your backup.
      </p>

      {modal === 'export' && <ExportModal items={items} onClose={() => setModal('none')} />}
      {modal === 'settings' && (
        <SettingsModal
          mapping={mapping}
          lastImport={lastImport}
          canEditMapping={canEditMapping}
          onEditMapping={onEditMapping}
          onClearAll={onClearAll}
          onClose={() => setModal('none')}
        />
      )}
    </div>
  )
}
