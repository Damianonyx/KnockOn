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
        10: { 1: { f: '=B2*B3' } },
        12: { 1: { f: '=SUM(B5:B9)' } },
      },
    },
  },
};

const univer = new Univer({ logLevel: 0 });
univer.registerPlugin(UniverSheetsPlugin);
univer.registerPlugin(UniverFormulaEnginePlugin);

const unit = univer.createUnit(UniverInstanceType.UNIVER_SHEET, snapshot);
console.log('createUnit returned:', unit?.constructor?.name);
console.log('proto methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(unit)).slice(0, 40));
console.log('instance keys:', Object.keys(unit ?? {}));

const u2 = univer.getUnit?.(UniverInstanceType.UNIVER_SHEET);
console.log('getUnit type:', u2?.constructor?.name);
