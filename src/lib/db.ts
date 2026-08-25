// Local persistence (PRD §6.7): everything lives in IndexedDB on this device.
// Nothing is ever sent to a server.

import Dexie, { type Table } from 'dexie'
import type { Item, Status } from './types.ts'
import type { Product } from './catalog.ts'

export interface MetaRow {
  key: string
  value: unknown
}

class ExpiryDB extends Dexie {
  items!: Table<Item, string>
  products!: Table<Product, string>
  meta!: Table<MetaRow, string>

  constructor() {
    // Keep the original database name so existing expiry-audit users retain
    // their local data across the product rename.
    super('pharmacy-expiry-tracker')
    this.version(1).stores({
      items: 'id',
      meta: 'key',
    })
    this.version(2).stores({
      items: 'id',
      products: 'id, brandNormalized, saltNormalized, category, isFamousBrand',
      meta: 'key',
    })
  }
}

export const db = new ExpiryDB()

export async function loadItems(): Promise<Item[]> {
  return db.items.toArray()
}

export async function loadProducts(): Promise<Product[]> {
  return db.products.toArray()
}

export async function replaceProducts(products: Product[]): Promise<void> {
  await db.transaction('rw', db.products, async () => {
    await db.products.clear()
    await db.products.bulkAdd(products)
  })
}

/** Replace the whole item set atomically (used on every import). */
export async function replaceItems(items: Item[]): Promise<void> {
  await db.transaction('rw', db.items, async () => {
    await db.items.clear()
    await db.items.bulkAdd(items)
  })
}

/** STAT-03: status changes persist immediately, no separate save step. */
export async function saveStatus(id: string, status: Status, lastUpdated: number): Promise<void> {
  await db.items.update(id, { status, lastUpdated })
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key)
  return row?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.items, db.products, db.meta, async () => {
    await db.items.clear()
    await db.products.clear()
    await db.meta.clear()
  })
}
