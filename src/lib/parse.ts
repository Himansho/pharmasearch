// File parsing (PRD §6.1): read a .xlsx/.xls/.csv entirely in the browser via
// SheetJS. Marg-style reports often have title/company rows above the real
// header row, so the header row is detected by scoring, not assumed.

export interface ParsedSheet {
  fileName: string
  sheetName: string
  /** De-duplicated, non-empty column labels (blank headers become "Column N") */
  headers: string[]
  /** Data rows keyed by header label, raw cell values preserved */
  rows: Record<string, unknown>[]
  /** Header row + up to 10 data rows, for the pre-import preview (IMP-03) */
  previewRows: unknown[][]
  totalDataRows: number
}

const HEADER_HINTS = [
  'item', 'name', 'product', 'medicin', 'desc', 'particular', 'batch', 'exp',
  'qty', 'quan', 'stock', 'stk', 'mrp', 'ptr', 'rate', 'company', 'mfg', 'mfr',
  'manuf', 'pack', 'unit', 'hsn', 's no', 'sno', 'sr no', 'code', 'rack', 'location',
]

function cellText(cell: unknown): string {
  return cell == null ? '' : String(cell).trim()
}

function rowIsEmpty(row: unknown[]): boolean {
  return row.every((c) => cellText(c) === '')
}

function headerScore(row: unknown[]): number {
  let score = 0
  for (const cell of row) {
    const text = cellText(cell).toLowerCase()
    if (!text || text.length > 40) continue
    if (HEADER_HINTS.some((h) => text.includes(h))) score++
  }
  return score
}

/** Pick the most header-looking row among the first 15 (Marg exports often
 * put the store name / report title / date range above the table). */
function findHeaderRow(aoa: unknown[][]): number {
  let bestIdx = -1
  let bestScore = 1 // require at least 2 keyword hits to win
  const limit = Math.min(aoa.length, 15)
  for (let i = 0; i < limit; i++) {
    const score = headerScore(aoa[i])
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  if (bestIdx >= 0) return bestIdx
  // Fallback: the first row with at least 2 non-empty cells
  for (let i = 0; i < limit; i++) {
    const filled = aoa[i].filter((c) => cellText(c) !== '').length
    if (filled >= 2) return i
  }
  return 0
}

function buildHeaders(headerRow: unknown[], width: number): string[] {
  const seen = new Map<string, number>()
  const headers: string[] = []
  for (let i = 0; i < width; i++) {
    let label = cellText(headerRow[i]) || `Column ${i + 1}`
    const count = seen.get(label) ?? 0
    seen.set(label, count + 1)
    if (count > 0) label = `${label} (${count + 1})`
    headers.push(label)
  }
  return headers
}

/**
 * Parse an uploaded workbook/CSV. Throws an Error with a user-friendly
 * message when the file has no readable tabular data. SheetJS is loaded on
 * demand so the initial page stays light on phone connections.
 */
export async function parseFile(data: ArrayBuffer, fileName: string): Promise<ParsedSheet> {
  const { read, utils } = await import('xlsx')
  let workbook
  try {
    workbook = read(new Uint8Array(data), { type: 'array' })
  } catch {
    throw new Error(
      'Could not read this file. Please upload the Excel (.xlsx) or CSV report exported from your POS software.',
    )
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const aoa = utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    })
    if (aoa.length === 0 || aoa.every(rowIsEmpty)) continue

    const headerIdx = findHeaderRow(aoa)
    const body = aoa.slice(headerIdx + 1).filter((r) => !rowIsEmpty(r))
    if (body.length === 0) continue

    const width = Math.max(
      aoa[headerIdx].length,
      ...body.slice(0, 50).map((r) => r.length),
    )
    const headers = buildHeaders(aoa[headerIdx], width)

    const rows = body.map((r) => {
      const obj: Record<string, unknown> = {}
      headers.forEach((h, i) => {
        obj[h] = r[i] ?? null
      })
      return obj
    })

    return {
      fileName,
      sheetName,
      headers,
      rows,
      previewRows: [aoa[headerIdx], ...body.slice(0, 10)],
      totalDataRows: rows.length,
    }
  }

  throw new Error(
    'No data found in this file. Make sure you exported the Batch Stock / Expiry Stock report with item rows in it.',
  )
}
