import { describe, expect, it } from 'vitest'
import {
  bucketForItem,
  bucketForMonths,
  formatExpiry,
  monthsUntilExpiry,
  parseExpiry,
} from './expiry.ts'

// Fixed "today": 15 July 2026
const NOW = new Date(2026, 6, 15)

describe('parseExpiry — string formats', () => {
  it('parses MM/YY (the standard Marg format)', () => {
    expect(parseExpiry('07/26', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('7/26', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('12/29', NOW)).toEqual({ month: 12, year: 2029 })
  })

  it('parses MM/YYYY and separators - and .', () => {
    expect(parseExpiry('07/2026', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('7-2026', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('07.26', NOW)).toEqual({ month: 7, year: 2026 })
  })

  it('parses year-first forms', () => {
    expect(parseExpiry('2026/07', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('2026-7', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('26/07', NOW)).toEqual({ month: 7, year: 2026 }) // yy/m fallback
  })

  it('parses full dates, discarding the day (d/m/y default)', () => {
    expect(parseExpiry('31/07/2026', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('31/07/26', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('07/31/2026', NOW)).toEqual({ month: 7, year: 2026 }) // m/d/y fallback
    expect(parseExpiry('2026-07-31', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('2026-07-31 00:00:00', NOW)).toEqual({ month: 7, year: 2026 })
  })

  it('parses month-name forms', () => {
    expect(parseExpiry('Jul-26', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('JULY 2026', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('Sept 26', NOW)).toEqual({ month: 9, year: 2026 })
    expect(parseExpiry('26-Jul', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('2026 July', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('31-Jul-26', NOW)).toEqual({ month: 7, year: 2026 })
  })

  it('parses compact digit forms', () => {
    expect(parseExpiry('0726', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('1226', NOW)).toEqual({ month: 12, year: 2026 })
    expect(parseExpiry('072026', NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry('72026', NOW)).toEqual({ month: 7, year: 2026 })
  })

  it('rejects unreadable values', () => {
    expect(parseExpiry('', NOW)).toBeNull()
    expect(parseExpiry('  ', NOW)).toBeNull()
    expect(parseExpiry('N.A.', NOW)).toBeNull()
    expect(parseExpiry('--', NOW)).toBeNull()
    expect(parseExpiry('2026', NOW)).toBeNull() // bare year: no month
    expect(parseExpiry('13/26', NOW)).toBeNull() // neither part is a valid month
    expect(parseExpiry(null, NOW)).toBeNull()
    expect(parseExpiry(undefined, NOW)).toBeNull()
    expect(parseExpiry('expired', NOW)).toBeNull()
  })
})

describe('parseExpiry — numbers and dates', () => {
  it('parses Excel date serials (UTC, no timezone drift)', () => {
    const serialJul2026 = Date.UTC(2026, 6, 1) / 86400000 + 25569
    expect(parseExpiry(serialJul2026, NOW)).toEqual({ month: 7, year: 2026 })
    const serialDec2027 = Date.UTC(2027, 11, 31) / 86400000 + 25569
    expect(parseExpiry(serialDec2027, NOW)).toEqual({ month: 12, year: 2027 })
  })

  it('parses serials arriving as text', () => {
    const serial = Date.UTC(2026, 6, 1) / 86400000 + 25569
    expect(parseExpiry(String(serial), NOW)).toEqual({ month: 7, year: 2026 })
  })

  it('prefers MMYYYY over a serial when the year is plausible', () => {
    expect(parseExpiry(72026, NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry(122026, NOW)).toEqual({ month: 12, year: 2026 })
  })

  it('parses Date objects', () => {
    expect(parseExpiry(new Date(2026, 6, 31), NOW)).toEqual({ month: 7, year: 2026 })
    expect(parseExpiry(new Date('invalid'), NOW)).toBeNull()
  })
})

describe('monthsUntilExpiry & buckets (PRD §7 table)', () => {
  it('computes month deltas across year boundaries', () => {
    expect(monthsUntilExpiry(7, 2026, NOW)).toBe(0)
    expect(monthsUntilExpiry(6, 2026, NOW)).toBe(-1)
    expect(monthsUntilExpiry(1, 2027, NOW)).toBe(6)
    expect(monthsUntilExpiry(12, 2025, new Date(2026, 0, 10))).toBe(-1)
    expect(monthsUntilExpiry(1, 2027, new Date(2026, 11, 10))).toBe(1)
  })

  it('assigns buckets exactly per the PRD table', () => {
    expect(bucketForMonths(-1)).toBe('expired')
    expect(bucketForMonths(0)).toBe('thisMonth')
    expect(bucketForMonths(1)).toBe('nextMonth')
    expect(bucketForMonths(2)).toBe('next3')
    expect(bucketForMonths(3)).toBe('next3')
    expect(bucketForMonths(4)).toBe('next6')
    expect(bucketForMonths(6)).toBe('next6')
    expect(bucketForMonths(7)).toBe('next12')
    expect(bucketForMonths(12)).toBe('next12')
    expect(bucketForMonths(13)).toBe('beyond12')
  })

  it('sends missing expiry to Needs Review', () => {
    expect(bucketForItem({ expiryMonth: null, expiryYear: null }, NOW)).toBe('needsReview')
    expect(bucketForItem({ expiryMonth: 7, expiryYear: 2026 }, NOW)).toBe('thisMonth')
  })
})

describe('formatExpiry', () => {
  it('formats as "Month YYYY" — never a day count', () => {
    expect(formatExpiry(7, 2026)).toBe('July 2026')
    expect(formatExpiry(1, 2027)).toBe('January 2027')
  })
})
