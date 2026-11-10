import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IWorkbookData } from '@univerjs/core';
import { openDatabase } from '@/server/db';
import { ProjectService } from '@/server/projects';
import { ExportService, excelFilename } from '@/server/exports';
import { ApiError } from '@/server/errors';

describe('Excel export access and snapshot', () => {
  it('exports saved formulas, allows frozen baselines, and rejects another owner, wrong scenario and stale revision before conversion', async () => {
    const db = await openDatabase(':memory:');
    try {
      const projects = new ProjectService(db, 'owner-a');
      let project = await projects.createProject({ name: 'Bakery', currency: 'GBP', templateId: 'bakery-v1', initialData: 'demo' });
      const baselineId = project.baselineScenarioId;
      project = await projects.forkScenario(project.id, { expectedRevision: project.revision, sourceScenarioId: baselineId, kind: 'shock', name: 'Energy shock' });
      let conversions = 0;
      let exported: IWorkbookData | undefined;
      const convert = async (workbook: IWorkbookData) => { conversions++; exported = workbook; return Buffer.from('test-file'); };
      const service = new ExportService(db, 'owner-a', convert);
      const file = await service.exportScenario(project.id, baselineId, project.revision);
      assert.equal(file.filename, 'Bakery-Baseline-r2.xlsx');
      assert.equal(file.buffer.toString(), 'test-file');
      assert.equal(exported!.sheets.model.cellData?.[14]?.[1]?.f, '=B11-B14');
      assert.equal(exported!.sheets.model.cellData?.[14]?.[1]?.v, 700);
      assert.equal((await projects.getProject(project.id)).revision, project.revision, 'export does not save or unfreeze the scenario');
      await assert.rejects(new ExportService(db, 'owner-b', convert).exportScenario(project.id, baselineId, project.revision), (e: unknown) => e instanceof ApiError && e.status === 404);
      await assert.rejects(service.exportScenario(project.id, 'other-scenario', project.revision), (e: unknown) => e instanceof ApiError && e.status === 404);
      await assert.rejects(service.exportScenario(project.id, baselineId, 1), (e: unknown) => e instanceof ApiError && e.code === 'REVISION_CONFLICT');
      assert.equal(conversions, 1, 'rejected requests never consume an export');
    } finally { await db.close(); }
  });

  it('keeps untrusted project names out of response headers and filenames', () => {
    const name = excelFilename({ name: '../../\r\nCookie: secret 🍞', revision: 8 }, { name: 'Price "response"' });
    assert.match(name, /^[a-zA-Z0-9-]+\.xlsx$/);
    assert.ok(name.endsWith('-r8.xlsx'));
  });
});
