export type Status = 'pending' | 'checked' | 'removed'

export const STATUS_LABELS: Record<Status, string> = {
  pending: 'Pending',
  checked: 'Checked',
  removed: 'Removed',
}

export interface Item {
  /** Stable key derived from item name + batch (expiry is appended only to break collisions) */
  id: string
  itemName: string
  batchNo: string
  company: string
  /** 1–12, or null when the expiry could not be read (goes to Needs Review) */
  expiryMonth: number | null
  expiryYear: number | null
  /** Original expiry cell text, kept so Needs Review can show what was in the file */
  expiryRaw: string
  quantity: number | null
  mrp: number | null
  ptr: number | null
  status: Status
  lastUpdated: number
}

export interface LastImport {
  fileName: string
  at: number
  added: number
  updated: number
  dropped: number
  needsReview: number
  total: number
}
