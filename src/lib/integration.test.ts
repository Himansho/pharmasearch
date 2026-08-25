import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { sampleSheet } from './sample.ts'
import { autoDetectMapping } from './mapping.ts'
import { runImport } from './importer.ts'
import { clearAllData, loadItems, replaceItems, saveStatus } from './db.ts'
import { bucketForItem, type BucketId } from './expiry.ts'
import { fullReportRows, returnListRows, returnStats } from './report.ts'

const NOW = new Date(2026, 6, 15)

describe('end-to-end data flow (sample → import → persist → audit → report)', () => {
  it('runs the full pipeline', async () => {
    await clearAllData()

    // Import the demo sheet through the same pipeline as an uploaded file
    const sheet = sampleSheet(NOW)
    const mapping = autoDetectMapping(sheet.headers)
    expect(mapping.itemName).toBe('Item Name')
    expect(mapping.expiry).toBe('Exp. Date')
    expect(mapping.batchNo).toBe('Batch No')
    expect(mapping.ptr).toBe('PTR')

    const outcome = runImport(sheet.rows, mapping, [], NOW)
    expect(outcome.summary.total).toBe(sheet.totalDataRows)
    expect(outcome.summary.skippedRows).toBe(0)
    expect(outcome.summary.needsReview).toBe(2)

    // Bucket sanity — the sample is generated relative to NOW
    const buckets = new Map<BucketId, number>()
    for (const i of outcome.items) {
      const b = bucketForItem(i, NOW)
      buckets.set(b, (buckets.get(b) ?? 0) + 1)
    }
    expect(buckets.get('expired')).toBe(3)
    expect(buckets.get('thisMonth')).toBe(2)
    expect(buckets.get('nextMonth')).toBe(3)
    expect(buckets.get('needsReview')).toBe(2)

    // Persist and reload
    await replaceItems(outcome.items)
    let stored = await loadItems()
    expect(stored).toHaveLength(outcome.items.length)
    expect(stored.every((i) => i.status === 'pending')).toBe(true)

    // One-tap status change persists immediately (STAT-03)
    const target = stored.find((i) => i.itemName.startsWith('Crocin'))
    expect(target).toBeDefined()
    await saveStatus(target!.id, 'removed', 999)
    stored = await loadItems()
    expect(stored.filter((i) => i.status === 'removed')).toHaveLength(1)

    // Return-to-distributor list: header + 1 removed item + totals (RPT-02)
    const rows = returnListRows(stored, NOW)
    expect(rows[0]).toEqual([
      'Item Name', 'Batch No.', 'Company', 'Expiry', 'Quantity', 'PTR', 'Return Value',
    ])
    expect(rows).toHaveLength(3)
    const stats = returnStats(stored)
    expect(stats.count).toBe(1)
    expect(stats.totalQty).toBe(22)
    expect(stats.totalValue).toBeCloseTo(22 * 14.6, 2)

    // Full report covers every item (RPT-01)
    expect(fullReportRows(stored, NOW)).toHaveLength(stored.length + 1)

    // Re-import the same file: everything matches, statuses preserved (IMP-04)
    const again = runImport(sheet.rows, mapping, stored, NOW)
    expect(again.summary.added).toBe(0)
    expect(again.summary.dropped).toBe(0)
    expect(again.summary.updated).toBe(stored.length)
    const crocin = again.items.find((i) => i.id === target!.id)
    expect(crocin?.status).toBe('removed')

    await clearAllData()
    expect(await loadItems()).toHaveLength(0)
  })
})
