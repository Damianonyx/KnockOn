import { Univer, UniverInstanceType, ICommandService } from '@univerjs/core';
import { UniverSheetsPlugin } from '@univerjs/sheets';
import { UniverFormulaEnginePlugin, ICalculateFormulaService } from '@univerjs/engine-formula';
import { firstValueFrom, timeout } from 'rxjs';

const snapshot = {
  id: 'spike',
  sheets: { model: { id: 'model', cellData: {
    1: { 1: { v: 1000 } }, 2: { 1: { v: 5 } }, 3: { 1: { v: 2 } },
    10: { 1: { f: '=B2*B3' } }, 14: { 1: { f: '=B11-B14' } },
  } } },
};

const univer = new Univer({ logLevel: 0 });
univer.registerPlugin(UniverSheetsPlugin);
univer.registerPlugin(UniverFormulaEnginePlugin);
const workbook = univer.createUnit(UniverInstanceType.UNIVER_SHEET, snapshot);
const injector = univer.__getInjector();
const calc = injector.get(ICalculateFormulaService);

// Wait for execution completion via the observable.
const done = firstValueFrom(calc.executionCompleteListener$.pipe(timeout(5000))).catch(() => null);
const t0 = Date.now();
await injector.get(ICommandService).executeCommand('formula.mutation.set-formula-calculation-start', {
  forceCalculation: true, dirtyRanges: [], dirtyNameMap: {}, dirtyDefinedNameMap: {},
  dirtyUnitFeatureMap: {}, dirtyUnitOtherFormulaMap: {}, clearDependencyTreeCache: {},
});
await done;
console.log('recalc completed in ms:', Date.now() - t0);
const snap = workbook.getSnapshot();
console.log('B11:', JSON.stringify(snap.sheets.model.cellData[10][1]));
console.log('B15:', JSON.stringify(snap.sheets.model.cellData[14][1]));

// Test loading a snapshot that includes precomputed values and re-calc.
const snap2 = JSON.parse(JSON.stringify(snap));
const univer2 = new Univer({ logLevel: 0 });
univer2.registerPlugin(UniverSheetsPlugin);
univer2.registerPlugin(UniverFormulaEnginePlugin);
const wb2 = univer2.createUnit(UniverInstanceType.UNIVER_SHEET, snap2);
console.log('reload B11 before recalc:', JSON.stringify(wb2.getSnapshot().sheets.model.cellData[10][1]));

// Round-trip check: formula intact + value present.
const out = wb2.getSnapshot();
console.log('round-trip formula intact:', out.sheets.model.cellData[10][1].f === '=B2*B3');
console.log('round-trip value preserved:', out.sheets.model.cellData[10][1].v === 5000);
