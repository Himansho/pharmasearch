// Report exports (PRD §6.6): a full audit report, and the filtered
// "Return to Distributor" list of Removed items — both as CSV or Excel.

import { BUCKET_LABELS, BUCKET_ORDER, bucketForItem, formatExpiry } from './expiry.ts'
import { STATUS_LABELS, type Item } from './types.ts'

type Cell = string | number

const BUCKET_RANK = new Map(BUCKET_ORDER.map((b, i) => [b.id, i]))

function expiryText(item: Item): string {
  if (item.expiryMonth != null && item.expiryYear != null) {
    return formatExpiry(item.expiryMonth, item.expiryYear)
  }
  return item.expiryRaw ? `Unreadable: ${item.expiryRaw}` : 'Missing'
}

function expirySortKey(item: Item): number {
  if (item.expiryMonth == null || item.expiryYear == null) return Number.MAX_SAFE_INTEGER
  return item.expiryYear * 12 + item.expiryMonth
}

function sortForReport(items: Item[], now: Date): Item[] {
  return [...items].sort((a, b) => {
    const rank = (BUCKET_RANK.get(bucketForItem(a, now)) ?? 0) - (BUCKET_RANK.get(bucketForItem(b, now)) ?? 0)
    if (rank !== 0) return rank
    const exp = expirySortKey(a) - expirySortKey(b)
    if (exp !== 0) return exp
    return a.itemName.localeCompare(b.itemName)
  })
}

/** RPT-01: every item with its current status. */
export function fullReportRows(items: Item[], now: Date): Cell[][] {
  const rows: Cell[][] = [[
    'Item Name', 'Batch No.', 'Company', 'Expiry', 'Expiry Bucket',
    'Quantity', 'MRP', 'PTR', 'Status',
  ]]
  for (const item of sortForReport(items, now)) {
    rows.push([
      item.itemName,
      item.batchNo,
      item.company,
      expiryText(item),
      BUCKET_LABELS[bucketForItem(item, now)],
      item.quantity ?? '',
      item.mrp ?? '',
      item.ptr ?? '',
      STATUS_LABELS[item.status],
    ])
  }
  return rows
}

export interface ReturnStats {
  count: number
  totalQty: number
  totalValue: number
}

export function returnStats(items: Item[]): ReturnStats {
  const removed = items.filter((i) => i.status === 'removed')
  let totalQty = 0
  let totalValue = 0
  for (const item of removed) {
    totalQty += item.quantity ?? 0
    if (item.quantity != null && item.ptr != null) {
      totalValue += item.quantity * item.ptr
    }
  }
  return { count: removed.length, totalQty, totalValue: round2(totalValue) }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** RPT-02: only Removed items — the list actually handed to the distributor. */
export function returnListRows(items: Item[], now: Date): Cell[][] {
  const removed = sortForReport(items.filter((i) => i.status === 'removed'), now)
  const rows: Cell[][] = [[
    'Item Name', 'Batch No.', 'Company', 'Expiry', 'Quantity', 'PTR', 'Return Value',
  ]]
  for (const item of removed) {
    const value = item.quantity != null && item.ptr != null ? round2(item.quantity * item.ptr) : ''
    rows.push([
      item.itemName,
      item.batchNo,
      item.company,
      expiryText(item),
      item.quantity ?? '',
      item.ptr ?? '',
      value,
    ])
  }
  const stats = returnStats(items)
  rows.push(['Total', '', '', '', stats.totalQty, '', stats.totalValue])
  return rows
}

function csvEscape(cell: Cell): string {
  const s = String(cell)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function downloadCSV(rows: Cell[][], fileName: string): void {
  // BOM so Excel opens UTF-8 (₹, drug names) correctly
  const BOM = String.fromCharCode(0xfeff)
  const content = BOM + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n')
  triggerDownload(new Blob([content], { type: 'text/csv;charset=utf-8' }), fileName)
}

export async function downloadXLSX(rows: Cell[][], fileName: string, sheetName: string): Promise<void> {
  const { utils, writeFile } = await import('xlsx')
  const sheet = utils.aoa_to_sheet(rows)
  sheet['!cols'] = rows[0].map((h, i) => ({ wch: i === 0 ? 32 : Math.max(10, String(h).length + 2) }))
  const wb = utils.book_new()
  utils.book_append_sheet(wb, sheet, sheetName)
  writeFile(wb, fileName)
}

export function dateStamp(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}
