// Expiry parsing and bucket logic (PRD §7).
// Medicine expiry is printed as month + year only, so nothing here ever works
// at day precision — a MM/YYYY is compared as "any time in that month".

export interface MonthYear {
  month: number // 1–12
  year: number
}

export type BucketId =
  | 'expired'
  | 'thisMonth'
  | 'nextMonth'
  | 'next3'
  | 'next6'
  | 'next12'
  | 'beyond12'
  | 'needsReview'

export interface BucketDef {
  id: BucketId
  label: string
}

/** Most urgent first (DASH-04); Needs Review trails the time buckets. */
export const BUCKET_ORDER: BucketDef[] = [
  { id: 'expired', label: 'Expired' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'nextMonth', label: 'Next Month' },
  { id: 'next3', label: 'Next 3 Months' },
  { id: 'next6', label: 'Next 6 Months' },
  { id: 'next12', label: 'Next 12 Months' },
  { id: 'beyond12', label: 'Beyond 12 Months' },
  { id: 'needsReview', label: 'Needs Review' },
]

export const BUCKET_LABELS: Record<BucketId, string> = Object.fromEntries(
  BUCKET_ORDER.map((b) => [b.id, b.label]),
) as Record<BucketId, string>

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MONTH_BY_PREFIX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

export function monthsUntilExpiry(month: number, year: number, now: Date): number {
  return (year - now.getFullYear()) * 12 + (month - (now.getMonth() + 1))
}

export function bucketForMonths(monthsUntil: number): BucketId {
  if (monthsUntil < 0) return 'expired'
  if (monthsUntil === 0) return 'thisMonth'
  if (monthsUntil === 1) return 'nextMonth'
  if (monthsUntil <= 3) return 'next3'
  if (monthsUntil <= 6) return 'next6'
  if (monthsUntil <= 12) return 'next12'
  return 'beyond12'
}

export function bucketForItem(
  item: { expiryMonth: number | null; expiryYear: number | null },
  now: Date,
): BucketId {
  if (item.expiryMonth == null || item.expiryYear == null) return 'needsReview'
  return bucketForMonths(monthsUntilExpiry(item.expiryMonth, item.expiryYear, now))
}

/** Display format per PRD: "July 2026" — never a day count. */
export function formatExpiry(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

function toYear(v: number): number {
  return v < 100 ? 2000 + v : v
}

function valid(month: number, year: number): MonthYear | null {
  return month >= 1 && month <= 12 && year >= 1990 && year <= 2099
    ? { month, year }
    : null
}

function fromMonthName(name: string, yearStr: string): MonthYear | null {
  const month = MONTH_BY_PREFIX[name.slice(0, 3).toLowerCase()]
  if (!month) return null
  return valid(month, toYear(parseInt(yearStr, 10)))
}

// Days between the Excel epoch (1899-12-30) and the Unix epoch.
const EXCEL_UNIX_OFFSET_DAYS = 25569

function fromExcelSerial(serial: number): MonthYear | null {
  const d = new Date(Math.round((serial - EXCEL_UNIX_OFFSET_DAYS) * 86400000))
  return valid(d.getUTCMonth() + 1, d.getUTCFullYear())
}

function fromNumber(n: number, now: Date): MonthYear | null {
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  const s = String(i)
  // A 5–6 digit number can be MMYYYY typed as a number (72026 → Jul 2026) or an
  // Excel date serial. A serial in the colliding range would be a 1932–2119 date;
  // prefer MMYYYY when its year lands near today, which is the plausible reading
  // for a medicine expiry column.
  if (s.length === 5 || s.length === 6) {
    const month = parseInt(s.slice(0, -4), 10)
    const year = parseInt(s.slice(-4), 10)
    const nowYear = now.getFullYear()
    if (month >= 1 && month <= 12 && year >= nowYear - 10 && year <= nowYear + 15) {
      return { month, year }
    }
  }
  if (i >= 20000 && i <= 80000) return fromExcelSerial(i) // 1954–2119
  return null
}

/**
 * Parse an expiry cell as it may arrive from a Marg-style Excel/CSV export.
 * Handles: "07/26", "07/2026", "7-26", "07.26", "2026/07", "2026-07-31",
 * "31/07/2026", "Jul-26", "JULY 2026", "26-Jul", "31-Jul-26", "0726",
 * "072026", Excel date serial numbers, and Date cells.
 * Returns null (→ Needs Review) for anything unreadable.
 */
export function parseExpiry(value: unknown, now: Date = new Date()): MonthYear | null {
  if (value == null) return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return valid(value.getMonth() + 1, value.getFullYear())
  }
  if (typeof value === 'number') return fromNumber(value, now)

  let s = String(value).trim().replace(/^["']+|["']+$/g, '').replace(/\s+/g, ' ')
  if (!s) return null
  // Strip a trailing time component ("2026-07-31 00:00:00")
  s = s.replace(/ \d{1,2}:\d{2}(:\d{2})?( ?(am|pm))?$/i, '').trim()

  let m: RegExpMatchArray | null

  // "07/2026", "7-2026", "07.2026"
  if ((m = s.match(/^(\d{1,2}) ?[/\-.] ?(\d{4})$/))) return valid(+m[1], +m[2])

  // "2026/07", "2026-7"
  if ((m = s.match(/^(\d{4}) ?[/\-.] ?(\d{1,2})$/))) return valid(+m[2], +m[1])

  // ISO date "2026-07-31" (day discarded)
  if ((m = s.match(/^(\d{4}) ?[/\-.] ?(\d{1,2}) ?[/\-.] ?(\d{1,2})$/))) {
    return valid(+m[2], +m[1])
  }

  // "31/07/2026" (d/m/y, the Indian default) or "07/31/2026" (m/d/y)
  if ((m = s.match(/^(\d{1,2}) ?[/\-.] ?(\d{1,2}) ?[/\-.] ?(\d{2,4})$/))) {
    const a = +m[1]
    const b = +m[2]
    const year = toYear(+m[3])
    if (b >= 1 && b <= 12) return valid(b, year)
    if (a >= 1 && a <= 12) return valid(a, year)
    return null
  }

  // "07/26" (m/yy) or "26/07" (yy/m)
  if ((m = s.match(/^(\d{1,2}) ?[/\-.] ?(\d{1,2})$/))) {
    const a = +m[1]
    const b = +m[2]
    if (a >= 1 && a <= 12) return valid(a, toYear(b))
    if (b >= 1 && b <= 12) return valid(b, toYear(a))
    return null
  }

  // "31-Jul-26" (day, month name, year — day discarded)
  if ((m = s.match(/^(\d{1,2})[ \-.,/]*([a-z]{3,9})[ \-.,/]*(\d{2}|\d{4})$/i))) {
    return fromMonthName(m[2], m[3])
  }

  // "Jul-26", "JULY 2026", "Sept 26"
  if ((m = s.match(/^([a-z]{3,9})[ \-.,/]*(\d{2}|\d{4})$/i))) {
    return fromMonthName(m[1], m[2])
  }

  // "26-Jul", "2026 July"
  if ((m = s.match(/^(\d{2}|\d{4})[ \-.,/]*([a-z]{3,9})$/i))) {
    return fromMonthName(m[2], m[1])
  }

  // Compact "0726" (MMYY)
  if ((m = s.match(/^(\d{2})(\d{2})$/))) {
    const month = +m[1]
    if (month >= 1 && month <= 12) return valid(month, toYear(+m[2]))
    return null
  }

  // Compact "072026" / "72026" (MMYYYY); falls through when it isn't one
  if ((m = s.match(/^(\d{1,2})(\d{4})$/))) {
    const r = valid(+m[1], +m[2])
    if (r) return r
  }

  // A bare number as text — an Excel serial pasted as a string
  if (/^\d+(\.\d+)?$/.test(s)) return fromNumber(parseFloat(s), now)

  return null
}
