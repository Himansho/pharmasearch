import { describe, expect, it } from 'vitest'
import {
  autoDetectMapping,
  mappingCompatible,
  resolveInitialMapping,
  type ColumnMapping,
} from './mapping.ts'

const MARG_HEADERS = ['S.No', 'Item Name', 'Pack', 'Batch No', 'Company', 'Exp. Date', 'Qty', 'MRP', 'PTR']

describe('autoDetectMapping', () => {
  it('detects a typical Marg header set', () => {
    const m = autoDetectMapping(MARG_HEADERS)
    expect(m.itemName).toBe('Item Name')
    expect(m.expiry).toBe('Exp. Date')
    expect(m.batchNo).toBe('Batch No')
    expect(m.quantity).toBe('Qty')
    expect(m.mrp).toBe('MRP')
    expect(m.ptr).toBe('PTR')
    expect(m.company).toBe('Company')
  })

  it('prefers exact matches over substring matches', () => {
    const m = autoDetectMapping(['Item Name', 'Expiry', 'Free Qty', 'Qty'])
    expect(m.quantity).toBe('Qty')
  })

  it('handles messy variants', () => {
    const m = autoDetectMapping(['PRODUCT NAME', 'EXP DT', 'B.NO', 'CUR.STK', 'M.R.P.', 'MFG'])
    expect(m.itemName).toBe('PRODUCT NAME')
    expect(m.expiry).toBe('EXP DT')
    expect(m.batchNo).toBe('B.NO')
    expect(m.quantity).toBe('CUR.STK')
    expect(m.mrp).toBe('M.R.P.')
    expect(m.company).toBe('MFG')
  })

  it('leaves unknown fields unmapped', () => {
    const m = autoDetectMapping(['Foo', 'Bar'])
    expect(m.itemName).toBeNull()
    expect(m.expiry).toBeNull()
  })
})

describe('mappingCompatible / resolveInitialMapping (MAP-02, MAP-03)', () => {
  const saved: ColumnMapping = {
    itemName: 'Item Name',
    expiry: 'Exp. Date',
    batchNo: 'Batch No',
    quantity: 'Qty',
    mrp: 'MRP',
    ptr: 'PTR',
    company: 'Company',
  }

  it('reuses the saved mapping when headers still fit', () => {
    const { mapping, usingSaved } = resolveInitialMapping(saved, MARG_HEADERS)
    expect(usingSaved).toBe(true)
    expect(mapping).toEqual(saved)
  })

  it('keeps surviving parts and fills gaps when the layout changed', () => {
    const headers = ['Item Name', 'Expiry', 'Batch No', 'Stock']
    expect(mappingCompatible(saved, headers)).toBe(false)
    const { mapping, usingSaved } = resolveInitialMapping(saved, headers)
    expect(usingSaved).toBe(false)
    expect(mapping.itemName).toBe('Item Name')
    expect(mapping.batchNo).toBe('Batch No')
    expect(mapping.expiry).toBe('Expiry') // re-detected
    expect(mapping.quantity).toBe('Stock') // re-detected
    expect(mapping.mrp).toBeNull()
  })

  it('auto-detects from scratch with no saved mapping', () => {
    const { mapping, usingSaved } = resolveInitialMapping(null, MARG_HEADERS)
    expect(usingSaved).toBe(false)
    expect(mapping.itemName).toBe('Item Name')
  })
})
