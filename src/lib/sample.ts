// Demo dataset shaped like a real Marg "Expiry Stock" export, so a pilot demo
// can run without a real file. It flows through the same mapping + import
// pipeline as an uploaded report.

import type { ParsedSheet } from './parse.ts'

const HEADERS = ['S.No', 'Item Name', 'Pack', 'Batch No', 'Company', 'Exp. Date', 'Qty', 'MRP', 'PTR']

// [name, pack, batch, company, expiry offset in months from now (or a raw bad string), qty, mrp, ptr]
type SampleRow = [string, string, string, string, number | string, number, number, number]

const ROWS: SampleRow[] = [
  ['Crocin Advance 500mg Tab', '15 TAB', 'CRA4508', 'GSK', -4, 22, 20.0, 14.6],
  ['Rantac 150 Tab', '30 TAB', 'RNT2201', 'JB Chemicals', -2, 8, 41.5, 29.9],
  ['Digene Gel Mint 200ml', '200 ML', 'DGM1104', 'Abbott', -1, 5, 132.0, 99.0],
  ['Dolo 650 Tab', '15 TAB', 'DLO6521', 'Micro Labs', 0, 45, 33.6, 25.2],
  ['Sinarest New Tab', '10 TAB', 'SNR0904', 'Centaur', 0, 18, 46.2, 33.4],
  ['Azithral 500 Tab', '5 TAB', 'AZT5077', 'Alembic', 1, 12, 119.5, 85.4],
  ['Meftal Spas Tab', '10 TAB', 'MFS3312', 'Blue Cross', 1, 30, 47.0, 33.8],
  ['Otrivin Adult Nasal Spray', '10 ML', 'OTR8891', 'GSK', 1, 9, 108.0, 79.3],
  ['Augmentin 625 Duo Tab', '10 TAB', 'AGM6255', 'GSK', 2, 14, 223.5, 161.0],
  ['Cetzine 10mg Tab', '10 TAB', 'CTZ7130', 'GSK', 2, 40, 27.3, 19.6],
  ['Pan-D Cap', '15 CAP', 'PND1420', 'Alkem', 3, 25, 199.0, 143.3],
  ['Electral Powder Orange', '21 GM', 'ELC0345', 'FDC', 3, 60, 22.1, 16.2],
  ['Benadryl Cough Syrup 150ml', '150 ML', 'BDL7719', 'Kenvue', 4, 11, 134.0, 98.5],
  ['Pan 40 Tab', '15 TAB', 'PAN4062', 'Alkem', 4, 33, 158.5, 114.1],
  ['Allegra 120mg Tab', '10 TAB', 'ALG1204', 'Sanofi', 5, 16, 218.6, 157.4],
  ['Zerodol-SP Tab', '10 TAB', 'ZDS5518', 'Ipca', 5, 28, 124.0, 89.3],
  ['Combiflam Tab', '20 TAB', 'CBF2087', 'Sanofi', 6, 50, 45.4, 32.7],
  ['Omez 20 Cap', '20 CAP', 'OMZ2033', "Dr Reddy's", 6, 26, 96.0, 69.1],
  ['Telma 40 Tab', '15 TAB', 'TLM4009', 'Glenmark', 7, 21, 224.0, 161.3],
  ['Amlokind-AT Tab', '15 TAB', 'AMK1276', 'Mankind', 8, 35, 55.3, 39.8],
  ['Volini Pain Relief Spray 100g', '100 GM', 'VLN9910', 'Sun Pharma', 8, 7, 335.0, 241.2],
  ['Glycomet-GP 1 Tab', '15 TAB', 'GGP1152', 'USV', 9, 24, 103.0, 74.2],
  ['Ecosprin AV 75 Cap', '15 CAP', 'EAV7566', 'USV', 10, 42, 71.8, 51.7],
  ['Montek LC Tab', '15 TAB', 'MLC4409', 'Sun Pharma', 11, 19, 189.0, 136.1],
  ['Shelcal 500 Tab', '15 TAB', 'SHL5023', 'Torrent', 12, 38, 116.0, 83.5],
  ['Eno Fruit Salt Lemon 100g', '100 GM', 'ENO7364', 'Haleon', 13, 27, 110.0, 79.2],
  ['Dolo 650 Tab', '15 TAB', 'DLO6588', 'Micro Labs', 13, 60, 33.6, 25.2],
  ['Liv.52 Tab', '100 TAB', 'LIV1010', 'Himalaya', 14, 15, 140.0, 100.8],
  ['Betadine 10% Ointment 20g', '20 GM', 'BTD2091', 'Win-Medicare', 15, 13, 122.0, 87.8],
  ['Limcee 500 Chewable Tab', '15 TAB', 'LMC0442', 'Abbott', 15, 55, 25.9, 18.6],
  ['Zincovit Tab', '15 TAB', 'ZCV8123', 'Apex', 16, 48, 105.0, 75.6],
  ['Becosules Cap', '20 CAP', 'BCS3358', 'Pfizer', 18, 52, 51.6, 37.2],
  ['Evion 400 Cap', '20 CAP', 'EVN4270', 'Merck', 20, 31, 62.4, 44.9],
  ['Neurobion Forte Tab', '30 TAB', 'NBF7789', 'P&G Health', 22, 23, 47.1, 33.9],
  ['Supradyn Daily Tab', '15 TAB', 'SPD1927', 'Bayer', 24, 36, 63.8, 45.9],
  ['Gelusil MPS Liquid 200ml', '200 ML', 'GLM5511', 'Pfizer', 'N.A.', 10, 145.0, 104.4],
  ['ORS-L Apple 200ml Tetra', '200 ML', 'ORS2288', 'JNTL', '', 34, 37.0, 26.6],
]

function mmYY(now: Date, offsetMonths: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear() % 100).padStart(2, '0')
  return `${mm}/${yy}`
}

export function sampleSheet(now: Date): ParsedSheet {
  const aoa: unknown[][] = ROWS.map((r, i) => {
    const [name, pack, batch, company, expiry, qty, mrp, ptr] = r
    const expiryText = typeof expiry === 'number' ? mmYY(now, expiry) : expiry
    return [i + 1, name, pack, batch, company, expiryText, qty, mrp, ptr]
  })
  const rows = aoa.map((r) => {
    const obj: Record<string, unknown> = {}
    HEADERS.forEach((h, i) => {
      obj[h] = r[i] ?? null
    })
    return obj
  })
  return {
    fileName: 'sample-expiry-stock.xlsx',
    sheetName: 'Expiry Stock',
    headers: [...HEADERS],
    rows,
    previewRows: [[...HEADERS], ...aoa.slice(0, 10)],
    totalDataRows: rows.length,
  }
}
