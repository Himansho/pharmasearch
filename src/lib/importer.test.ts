import { describe, expect, it } from 'vitest'
import { buildFreshItems, parseNumber, runImport } from './importer.ts'
import type { ColumnMapping } from './mapping.ts'
import type { Item } from './types.ts'

const NOW = new Date(2026, 6, 15)

const MAPPING: ColumnMapping = {
  itemName: 'Item Name',
  expiry: 'Exp',
  batchNo: 'Batch',
  quantity: 'Qty',
  mrp: 'MRP',
  ptr: 'PTR',
  company: 'Company',
}

function row(
  name: string,
  exp: unknown,
  batch = 'B1',
  qty: unknown = 10,
): Record<string, unknown> {
  return { 'Item Name': name, Exp: exp, Batch: batch, Qty: qty, MRP: 100, PTR: 75, Company: 'Acme' }
}

describe('parseNumber', () => {
  it('handles numbers, formatted strings, and junk', () => {
    expect(parseNumber(12)).toBe(12)
    expect(parseNumber('1,240.50')).toBe(1240.5)
    expect(parseNumber('₹ 85.00')).toBe(85)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber(null)).toBeNull()
    expect(parseNumber('abc')).toBeNull()
  })
})

describe('buildFreshItems', () => {
  it('skips rows without an item name and total rows (IMP-05 adjacent)', () => {
    const { fresh, skippedRows } = buildFreshItems(
      [row('Dolo 650', '07/26'), row('', '07/26'), row('Grand Total', '', '', 500)],
      MAPPING,
      NOW,
    )
    expect(fresh).toHaveLength(1)
    expect(skippedRows).toBe(2)
  })

  it('flags unreadable expiry instead of dropping the row (IMP-05)', () => {
    const { fresh } = buildFreshItems([row('Dolo 650', 'N.A.')], MAPPING, NOW)
    expect(fresh).toHaveLength(1)
    expect(fresh[0].expiryMonth).toBeNull()
    expect(fresh[0].expiryRaw).toBe('N.A.')
  })

  it('merges duplicate name+batch+expiry rows by summing quantity', () => {
    const { fresh } = buildFreshItems(
      [row('Dolo 650', '07/26', 'B1', 10), row('Dolo 650', '07/26', 'B1', 5)],
      MAPPING,
      NOW,
    )
    expect(fresh).toHaveLength(1)
    expect(fresh[0].quantity).toBe(15)
  })

  it('keeps duplicate name+batch rows with different expiry as separate items', () => {
    const { fresh } = buildFreshItems(
      [row('Dolo 650', '07/26', 'B1'), row('Dolo 650', '01/27', 'B1')],
      MAPPING,
      NOW,
    )
    expect(fresh).toHaveLength(2)
    expect(new Set(fresh.map((f) => f.id)).size).toBe(2)
  })

  it('keys identity on normalized name + batch', () => {
    const { fresh } = buildFreshItems(
      [row('  DOLO 650 ', '07/26', 'b1', 3), row('Dolo  650', '07/26', 'B1', 4)],
      MAPPING,
      NOW,
    )
    expect(fresh).toHaveLength(1)
    expect(fresh[0].quantity).toBe(7)
  })
})

describe('runImport (IMP-04 re-import merge)', () => {
  it('first import: everything added as pending', () => {
    const { items, summary } = runImport(
      [row('Dolo 650', '07/26'), row('Pan 40', '01/27')],
      MAPPING,
      [],
      NOW,
    )
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.status === 'pending')).toBe(true)
    expect(summary).toMatchObject({ added: 2, updated: 0, dropped: 0 })
  })

  it('re-import preserves status marks and updates quantity/expiry', () => {
    const first = runImport([row('Dolo 650', '07/26', 'B1', 10)], MAPPING, [], NOW)
    const audited: Item[] = first.items.map((i) => ({ ...i, status: 'removed', lastUpdated: 123 }))

    const second = runImport(
      [row('Dolo 650', '08/26', 'B1', 4), row('Pan 40', '01/27', 'B2')],
      MAPPING,
      audited,
      NOW,
    )
    const dolo = second.items.find((i) => i.itemName === 'Dolo 650')
    expect(dolo).toBeDefined()
    expect(dolo?.status).toBe('removed') // status preserved
    expect(dolo?.lastUpdated).toBe(123)
    expect(dolo?.quantity).toBe(4) // quantity updated
    expect(dolo?.expiryMonth).toBe(8) // expiry updated
    expect(second.summary).toMatchObject({ added: 1, updated: 1, dropped: 0 })
  })

  it('drops stored items that vanished from the new report', () => {
    const first = runImport(
      [row('Dolo 650', '07/26', 'B1'), row('Pan 40', '01/27', 'B2')],
      MAPPING,
      [],
      NOW,
    )
    const second = runImport([row('Pan 40', '01/27', 'B2')], MAPPING, first.items, NOW)
    expect(second.items).toHaveLength(1)
    expect(second.summary.dropped).toBe(1)
  })

  it('counts needs-review rows', () => {
    const { summary } = runImport(
      [row('Dolo 650', '07/26'), row('Gelusil', 'N.A.', 'B9')],
      MAPPING,
      [],
      NOW,
    )
    expect(summary.needsReview).toBe(1)
  })

  it('works with only required fields mapped', () => {
    const minimal: ColumnMapping = {
      itemName: 'Item Name',
      expiry: 'Exp',
      batchNo: null,
      quantity: null,
      mrp: null,
      ptr: null,
      company: null,
    }
    const { items } = runImport([row('Dolo 650', '07/26')], minimal, [], NOW)
    expect(items).toHaveLength(1)
    expect(items[0].batchNo).toBe('')
    expect(items[0].quantity).toBeNull()
  })
})
