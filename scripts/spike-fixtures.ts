import { HeadlessWorkbookAdapter } from '../src/lib/univer/server/headless';
import { buildBakeryWorkbook, BAKERY_DEMO_INPUTS } from '../src/lib/templates/bakery';
import { deepCopyWorkbook } from '../src/lib/univer/server/headless';

const cases = [
  { name: 'baseline', inputs: { ...BAKERY_DEMO_INPUTS } },
  { name: 'energy shock', inputs: { ...BAKERY_DEMO_INPUTS, monthlyEnergy: 600 } },
  { name: 'price response', inputs: { ...BAKERY_DEMO_INPUTS, monthlyEnergy: 600, unitPrice: 5.5, monthlyUnits: 950 } },
  { name: 'supplier response', inputs: { ...BAKERY_DEMO_INPUTS, monthlyEnergy: 600, ingredientCostPerUnit: 1.8, monthlyDelivery: 100 } },
];

async function main() {
  for (const c of cases) {
    const adapter = new HeadlessWorkbookAdapter();
    await adapter.load(buildBakeryWorkbook(c.inputs as any, `wb-${c.name}`));
    const p = adapter.readProjection();
    console.log(c.name, JSON.stringify(p.inputs), JSON.stringify(p.metrics), 'errors:', p.errors.length);
    adapter.dispose();
  }

  // Deep copy must preserve formulas and not alias the source.
  const src = buildBakeryWorkbook(BAKERY_DEMO_INPUTS, 'src-1');
  const copy = deepCopyWorkbook(src, 'src-2');
  const srcCell = (src as any).sheets.model.cellData[10][1];
  const copyCell = (copy as any).sheets.model.cellData[10][1];
  console.log('formula preserved:', copyCell.f === srcCell.f, '| ids differ:', copy.id !== src.id, '| not aliased:', copyCell !== srcCell);
}

main().catch((e) => { console.error(e); process.exit(1); });
