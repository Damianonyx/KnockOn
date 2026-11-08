import { Univer, UniverInstanceType, ICommandService } from '@univerjs/core';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';

// Test error formulas + zero revenue margin
const snapshot = {
  id: 'spike',
  sheets: {
    model: {
      id: 'model',
      cellData: {
        1: { 1: { v: 0 } },          // B2 units = 0
        2: { 1: { v: 0 } },          // B3 price = 0 -> revenue 0
        3: { 1: { v: 2 } },
        10: { 1: { f: '=B2*B3' } },  // revenue 0
        11: { 1: { f: '=B2*B4' } },  // ingredient costs
        12: { 1: { f: '=SUM(B5:B9)' } },
        13: { 1: { f: '=B12+B13' } },
        14: { 1: { f: '=B11-B14' } },
        15: { 1: { f: '=IF(B11=0,"",B15/B11)' } },  // margin should be blank ""
        16: { 1: { f: '=1/0' } },    // DIV/0 error
        17: { 1: { f: '=FOO()' } },  // unknown function error
      },
    },
  },
};

const univer = new Univer({ logLevel: 0 });
univer.registerPlugin(UniverSheetsPlugin);
univer.registerPlugin(UniverFormulaEnginePlugin);
const workbook = univer.createUnit(UniverInstanceType.UNIVER_SHEET, snapshot);
const injector = univer.__getInjector();
const commandService = injector.get(ICommandService);
await commandService.executeCommand('formula.mutation.set-formula-calculation-start', {
  forceCalculation: true, dirtyRanges: [], dirtyNameMap: {}, dirtyDefinedNameMap: {},
  dirtyUnitFeatureMap: {}, dirtyUnitOtherFormulaMap: {}, clearDependencyTreeCache: {},
});
await new Promise((r) => setTimeout(r, 300));

const snap = workbook.getSnapshot();
const cd = snap.sheets.model.cellData;
for (const row of [10, 14, 15, 16, 17]) {
  console.log(`B${row + 1}:`, JSON.stringify(cd[row]?.[1]));
}

// How do we read error info via worksheet API?
const sheet = workbook.getSheetBySheetId('model');
console.log('sheet.getCell(15,1):', sheet.getCell(15, 1));
console.log('sheet.getCellValue?', typeof sheet.getCellValue);
console.log('sheet.getCellValue(15,1):', JSON.stringify(sheet.getCellValue?.(15, 1)));
console.log('sheet.getCellRaw(15,1):', JSON.stringify(sheet.getCellRaw?.(15, 1)));
console.log('worksheet methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(sheet)).filter(m => /cell|value|error/i.test(m)).join(', '));
