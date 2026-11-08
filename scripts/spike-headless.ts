// SPIKE: headless Univer workbook creation + formula calculation in Node.
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
        1: { 1: { v: 1000 } },       // B2 monthlyUnits
        2: { 1: { v: 5 } },          // B3 unitPrice
        3: { 1: { v: 2 } },          // B4 ingredientCostPerUnit
        4: { 1: { v: 400 } },        // B5 monthlyEnergy
        5: { 1: { v: 600 } },        // B6 monthlyRent
        6: { 1: { v: 1200 } },       // B7 monthlyWages
        7: { 1: { v: 100 } },        // B8 monthlyOtherCosts
        8: { 1: { v: 0 } },          // B9 monthlyDelivery
        10: { 1: { f: '=B2*B3' } },  // B11 revenue
        11: { 1: { f: '=B2*B4' } },  // B12 ingredientCosts
        12: { 1: { f: '=SUM(B5:B9)' } }, // B13 fixedCosts
        13: { 1: { f: '=B12+B13' } },// B14 totalCosts
        14: { 1: { f: '=B11-B14' } },// B15 profit
        15: { 1: { f: '=IF(B11=0,"",B15/B11)' } }, // B16 marginFraction
      },
    },
  },
};

async function main() {
  const univer = new Univer({ logLevel: 0 });
  univer.registerPlugin(UniverSheetsPlugin);
  univer.registerPlugin(UniverFormulaEnginePlugin);

  const workbook = univer.createUnit(UniverInstanceType.UNIVER_SHEET, snapshot);
  console.log('workbook created:', workbook?.getId?.());

  // Give the formula engine a tick to calculate.
  await new Promise((r) => setTimeout(r, 100));

  const sheet = workbook?.getSheet('model');
  console.log('sheet:', sheet?.getName?.());

  // Try to read calculated values via the worksheet API.
  for (const [row, col, label] of [[10, 1, 'revenue B11'], [13, 1, 'totalCosts B14'], [14, 1, 'profit B15'], [15, 1, 'margin B16']]) {
    const cell = sheet?.getCell(row, col);
    console.log(label, '->', JSON.stringify(cell?.getValue?.()));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
