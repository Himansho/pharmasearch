// Import pipeline (PRD §6.1): mapped rows → Items, merged against what is
// already stored so a weekly re-import updates quantities/expiry without
// duplicating items or losing audit status marks (IMP-04).

import { parseExpiry } from './expiry.ts'
import type { ColumnMapping } from './mapping.ts'
import type { Item } from './types.ts'

export interface ImportSummary {
  added: number
  updated: number
  /** Items that were stored before but are absent from the new file (sold out / already returned) */
  dropped: number
  needsReview: number
  /** Rows skipped because they had no item name (blank/total rows) */
  skippedRows: number
  total: number
}

export interface ImportOutcome {
  items: Item[]
  summary: ImportSummary
}

export function parseNumber(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const s = String(value).replace(/[^0-9.-]/g, '')
  if (!s || s === '-' || s === '.') return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function normKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** A row that is a report footer, not a medicine ("Total", "Grand Total"…) */
function isTotalRow(name: string): boolean {
  return /^(grand |sub |page )?total\b/i.test(name)
}

type FreshItem = Omit<Item, 'status' | 'lastUpdated'>

function sameExpiry(a: FreshItem, m: number | null, y: number | null): boolean {
  return a.expiryMonth === m && a.expiryYear === y
}

function addQty(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null
  return (a ?? 0) + (b ?? 0)
}

/**
 * Build the de-duplicated item list from mapped rows. Identity is
 * Item Name + Batch No (IMP-04); rows that collide with the same expiry are
 * treated as one stock line and their quantities summed, while a collision
 * with a different expiry gets the expiry appended to its key so both survive.
 */
export function buildFreshItems(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  now: Date = new Date(),
): { fresh: FreshItem[]; skippedRows: number } {
  const byKey = new Map<string, FreshItem>()
  let skippedRows = 0

  const cell = (row: Record<string, unknown>, field: keyof ColumnMapping): unknown => {
    const label = mapping[field]
    return label == null ? null : row[label]
  }

  for (const row of rows) {
    const itemName = text(cell(row, 'itemName'))
    if (!itemName || isTotalRow(itemName)) {
      skippedRows++
      continue
    }
    const batchNo = text(cell(row, 'batchNo'))
    const company = text(cell(row, 'company'))
    const expiryCell = cell(row, 'expiry')
    const expiry = parseExpiry(expiryCell, now)
    const quantity = parseNumber(cell(row, 'quantity'))

    const item: FreshItem = {
      id: '',
      itemName,
      batchNo,
      company,
      expiryMonth: expiry?.month ?? null,
      expiryYear: expiry?.year ?? null,
      expiryRaw: text(expiryCell),
      quantity,
      mrp: parseNumber(cell(row, 'mrp')),
      ptr: parseNumber(cell(row, 'ptr')),
    }

    const base = `${normKey(itemName)}|${normKey(batchNo)}`
    const existing = byKey.get(base)
    if (!existing) {
      item.id = base
      byKey.set(base, item)
      continue
    }
    if (sameExpiry(existing, item.expiryMonth, item.expiryYear)) {
      existing.quantity = addQty(existing.quantity, quantity)
      continue
    }
    const suffixed = `${base}|${item.expiryMonth ?? 'x'}/${item.expiryYear ?? 'x'}`
    const sibling = byKey.get(suffixed)
    if (sibling && sameExpiry(sibling, item.expiryMonth, item.expiryYear)) {
      sibling.quantity = addQty(sibling.quantity, quantity)
    } else {
      item.id = suffixed
      byKey.set(suffixed, item)
    }
  }

  return { fresh: [...byKey.values()], skippedRows }
}

/**
 * Merge a fresh import against stored items. Matched items keep their status
 * and lastUpdated (the audit trail); unmatched stored items are dropped —
 * the stock report is the source of truth for what is on the shelf.
 */
export function runImport(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  existing: Item[],
  now: Date = new Date(),
): ImportOutcome {
  const { fresh, skippedRows } = buildFreshItems(rows, mapping, now)
  const existingById = new Map(existing.map((i) => [i.id, i]))
  const ts = now.getTime()

  let added = 0
  let updated = 0
  let needsReview = 0

  const items: Item[] = fresh.map((f) => {
    if (f.expiryMonth == null) needsReview++
    const prior = existingById.get(f.id)
    if (prior) {
      updated++
      return { ...f, status: prior.status, lastUpdated: prior.lastUpdated }
    }
    added++
    return { ...f, status: 'pending', lastUpdated: ts }
  })

  const freshIds = new Set(items.map((i) => i.id))
  const dropped = existing.filter((i) => !freshIds.has(i.id)).length

  return {
    items,
    summary: { added, updated, dropped, needsReview, skippedRows, total: items.length },
  }
}
