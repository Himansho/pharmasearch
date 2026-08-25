import { useMemo, useState } from 'react'
import type { ParsedSheet } from '../lib/parse.ts'
import { FIELD_DEFS, type ColumnMapping, type MappedField } from '../lib/mapping.ts'
import { formatExpiry, parseExpiry } from '../lib/expiry.ts'

interface MappingScreenProps {
  sheet: ParsedSheet
  initial: ColumnMapping
  mode: 'import' | 'edit'
  usingSaved: boolean
  onConfirm: (mapping: ColumnMapping) => void
  onCancel: () => void
}

function cellText(v: unknown): string {
  return v == null ? '' : String(v)
}

export function MappingScreen({ sheet, initial, mode, usingSaved, onConfirm, onCancel }: MappingScreenProps) {
  const [map, setMap] = useState<ColumnMapping>(initial)
  const [confirming, setConfirming] = useState(false)

  const setField = (field: MappedField, value: string) => {
    setMap((prev) => ({ ...prev, [field]: value === '' ? null : value }))
  }

  const mappedLabels = useMemo(() => {
    const set = new Set<string>()
    for (const def of FIELD_DEFS) {
      const v = map[def.key]
      if (v != null) set.add(v)
    }
    return set
  }, [map])

  const duplicates = useMemo(() => {
    const counts = new Map<string, number>()
    for (const def of FIELD_DEFS) {
      const v = map[def.key]
      if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return [...counts.entries()].filter(([, c]) => c > 1).map(([h]) => h)
  }, [map])

  const expiryCheck = useMemo(() => {
    const col = map.expiry
    if (col == null) return null
    const sample = sheet.rows.slice(0, 3000)
    let ok = 0
    const good: { raw: string; parsed: string }[] = []
    const bad: string[] = []
    for (const row of sample) {
      const cell = row[col]
      const parsed = parseExpiry(cell)
      if (parsed) {
        ok++
        if (good.length < 2) {
          good.push({ raw: cellText(cell), parsed: formatExpiry(parsed.month, parsed.year) })
        }
      } else {
        const t = cellText(cell).trim() || '(empty)'
        if (bad.length < 3 && !bad.includes(t)) bad.push(t)
      }
    }
    return { total: sample.length, ok, unreadable: sample.length - ok, good, bad }
  }, [map.expiry, sheet.rows])

  const valid = map.itemName != null && map.expiry != null

  const confirm = () => {
    if (!valid || confirming) return
    setConfirming(true)
    onConfirm(map)
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>{mode === 'edit' ? 'Edit column mapping' : 'Confirm columns'}</h1>
        <p>
          {sheet.fileName}
          {mode === 'import' && ` · ${sheet.totalDataRows} data rows found`}
        </p>
        {mode === 'edit' && (
          <p className="note">Changes apply from your next import — current items are not changed.</p>
        )}
        {mode === 'import' && usingSaved && (
          <p className="note ok">Using your saved column mapping — just confirm and import.</p>
        )}
      </header>

      <section className="card">
        <h2>Preview</h2>
        <p className="muted">First rows of the file. Highlighted columns are the ones being imported.</p>
        <div className="preview-wrap">
          <table className="preview">
            <thead>
              <tr>
                {sheet.headers.map((h, i) => (
                  <th key={i} className={mappedLabels.has(h) ? 'mapped' : ''}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.previewRows.slice(1).map((row, ri) => (
                <tr key={ri}>
                  {sheet.headers.map((h, ci) => (
                    <td key={ci} className={mappedLabels.has(h) ? 'mapped' : ''}>
                      {cellText(row[ci]) || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Match your columns</h2>
        <p className="muted">
          Tell the app which column holds what. This is remembered on this device, so next
          week&apos;s import is one tap.
        </p>
        <div className="map-grid">
          {FIELD_DEFS.map((def) => (
            <label key={def.key} className="map-row">
              <span className="map-label">
                {def.label}
                {def.required ? <em aria-hidden="true"> *</em> : ''}
                <small>{def.hint}</small>
              </span>
              <select
                value={map[def.key] ?? ''}
                onChange={(e) => setField(def.key, e.target.value)}
                aria-label={`Column for ${def.label}`}
              >
                <option value="">— Not in this file —</option>
                {sheet.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        {duplicates.length > 0 && (
          <p className="warn-note">
            The same column is selected for more than one field: {duplicates.join(', ')}. That is
            usually a mistake.
          </p>
        )}

        {!valid && (
          <p className="warn-note">Item Name and Expiry are required to continue.</p>
        )}

        {expiryCheck && (
          <div className={`expiry-check${expiryCheck.unreadable > 0 ? ' has-issues' : ''}`}>
            <p>
              <strong>
                {expiryCheck.ok} of {expiryCheck.total}
              </strong>{' '}
              rows have a readable expiry
              {expiryCheck.good.length > 0 && (
                <>
                  {' — e.g. '}
                  {expiryCheck.good.map((g, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      &ldquo;{g.raw}&rdquo; → {g.parsed}
                    </span>
                  ))}
                </>
              )}
            </p>
            {expiryCheck.unreadable > 0 && (
              <p>
                {expiryCheck.unreadable} unreadable (will be listed under Needs Review):{' '}
                {expiryCheck.bad.map((b, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    &ldquo;{b}&rdquo;
                  </span>
                ))}
              </p>
            )}
          </div>
        )}
      </section>

      <div className="btn-row sticky-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid || confirming}
          onClick={confirm}
        >
          {confirming
            ? 'Importing…'
            : mode === 'edit'
              ? 'Save mapping'
              : `Import ${sheet.totalDataRows} rows`}
        </button>
      </div>
    </div>
  )
}
