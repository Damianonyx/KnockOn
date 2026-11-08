import { Univer, UniverInstanceType } from '@univerjs/core';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';

const snapshot = {
  id: 'spike-workbook',
  sheets: {
    model: {
      id: 'model',
      name: 'model',
      cellData: {
        1: { 1: { v: 1000 } },
        2: { 1: { v: 5 } },
        3: { 1: { v: 2 } },
        4: { 1: { v: 400 } },
        5: { 1: { v: 600 } },
        6: { 1: { v: 1200 } },
        7: { 1: { v: 100 } },
        8: { 1: { v: 0 } },
        10: { 1: { f: '=B2*B3' } },
        11: { 1: { f: '=B2*B4' } },
        12: { 1: { f: '=SUM(B5:B9)' } },
        13: { 1: { f: '=B12+B13' } },
        14: { 1: { f: '=B11-B14' } },
        15: { 1: { f: '=IF(B11=0,"",B15/B11)' } },
      },
    },
  },
};

const univer = new Univer({ logLevel: 0 });
univer.registerPlugin(UniverSheetsPlugin);
univer.registerPlugin(UniverFormulaEnginePlugin);

const workbook = univer.createUnit(UniverInstanceType.UNIVER_SHEET, snapshot);
await new Promise((r) => setTimeout(r, 200));

const sheet = workbook.getSheetBySheetId('model');
console.log('sheet name:', sheet.getName());

// Read raw cell data (from the snapshot)
for (const [row, label] of [[10, 'B11 revenue'], [13, 'B14 totalCosts'], [14, 'B15 profit'], [15, 'B16 margin']]) {
  const cell = sheet.getCell(row, 1);
  console.log(label, 'getValue:', JSON.stringify(cell?.getValue?.()));
  const raw = sheet.getCellRaw?.(row, 1);
  console.log(label, 'getCellRaw:', JSON.stringify(raw));
}

// getSnapshot
const snap = workbook.getSnapshot();
console.log('snapshot sheets:', Object.keys(snap.sheets ?? {}));
console.log('snapshot B11:', JSON.stringify(snap.sheets.model.cellData?.[10]?.[1]));
console.log('snapshot B16:', JSON.stringify(snap.sheets.model.cellData?.[15]?.[1]));
