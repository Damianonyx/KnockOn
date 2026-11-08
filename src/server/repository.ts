/**
 * Row-level persistence for projects and scenarios. Synchronous so callers can
 * group several statements into one transaction (see db.ts).
 */
import type { DatabaseSync } from 'node:sqlite';
import type { Assumption, Calculation, ScenarioKind } from '@/lib/contracts/project';
import type { BakeryWorkbook } from '@/lib/univer/snapshot';

export interface ProjectRecord {
  id: string;
  name: string;
  currency: string;
  templateId: string;
  templateVersion: number;
  schemaVersion: number;
  revision: number;
  baselineScenarioId: string;
  baselineFrozen: boolean;
  demo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioRecord {
  id: string;
  projectId: string;
  position: number;
  name: string;
  kind: ScenarioKind;
  parentScenarioId: string | null;
  notes: string;
  workbook: BakeryWorkbook;
  assumptions: Assumption[];
  calculation: Calculation;
  createdAt: string;
  updatedAt: string;
}

type Row = Record<string, unknown>;

function toProject(row: Row): ProjectRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    currency: String(row.currency),
    templateId: String(row.template_id),
    templateVersion: Number(row.template_version),
    schemaVersion: Number(row.schema_version),
    revision: Number(row.revision),
    baselineScenarioId: String(row.baseline_scenario_id),
    baselineFrozen: Number(row.baseline_frozen) === 1,
    demo: Number(row.demo) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toScenario(row: Row): ScenarioRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    position: Number(row.position),
    name: String(row.name),
    kind: String(row.kind) as ScenarioKind,
    parentScenarioId: row.parent_scenario_id == null ? null : String(row.parent_scenario_id),
    notes: String(row.notes),
    workbook: JSON.parse(String(row.workbook)) as BakeryWorkbook,
    assumptions: JSON.parse(String(row.assumptions)) as Assumption[],
    calculation: JSON.parse(String(row.calculation)) as Calculation,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listProjects(db: DatabaseSync): ProjectRecord[] {
  return (db.prepare('SELECT * FROM projects ORDER BY updated_at DESC, created_at DESC').all() as Row[]).map(toProject);
}

export function findProject(db: DatabaseSync, id: string): ProjectRecord | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row | undefined;
  return row ? toProject(row) : null;
}

export function listScenarios(db: DatabaseSync, projectId: string): ScenarioRecord[] {
  return (db.prepare('SELECT * FROM scenarios WHERE project_id = ? ORDER BY position').all(projectId) as Row[]).map(toScenario);
}

export function findScenario(db: DatabaseSync, projectId: string, scenarioId: string): ScenarioRecord | null {
  const row = db.prepare('SELECT * FROM scenarios WHERE project_id = ? AND id = ?').get(projectId, scenarioId) as Row | undefined;
  return row ? toScenario(row) : null;
}

export function insertProject(db: DatabaseSync, p: ProjectRecord): void {
  db.prepare(
    `INSERT INTO projects (id, name, currency, template_id, template_version, schema_version, revision,
       baseline_scenario_id, baseline_frozen, demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    p.id,
    p.name,
    p.currency,
    p.templateId,
    p.templateVersion,
    p.schemaVersion,
    p.revision,
    p.baselineScenarioId,
    p.baselineFrozen ? 1 : 0,
    p.demo ? 1 : 0,
    p.createdAt,
    p.updatedAt,
  );
}

export function insertScenario(db: DatabaseSync, s: ScenarioRecord): void {
  db.prepare(
    `INSERT INTO scenarios (id, project_id, position, name, kind, parent_scenario_id, notes, workbook,
       assumptions, calculation, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    s.id,
    s.projectId,
    s.position,
    s.name,
    s.kind,
    s.parentScenarioId,
    s.notes,
    JSON.stringify(s.workbook),
    JSON.stringify(s.assumptions),
    JSON.stringify(s.calculation),
    s.createdAt,
    s.updatedAt,
  );
}

export function updateScenarioContent(
  db: DatabaseSync,
  s: Pick<ScenarioRecord, 'id' | 'projectId' | 'name' | 'notes' | 'workbook' | 'assumptions' | 'calculation' | 'updatedAt'>,
): void {
  db.prepare(
    `UPDATE scenarios SET name = ?, notes = ?, workbook = ?, assumptions = ?, calculation = ?, updated_at = ?
     WHERE id = ? AND project_id = ?`,
  ).run(
    s.name,
    s.notes,
    JSON.stringify(s.workbook),
    JSON.stringify(s.assumptions),
    JSON.stringify(s.calculation),
    s.updatedAt,
    s.id,
    s.projectId,
  );
}

export function nextScenarioPosition(db: DatabaseSync, projectId: string): number {
  const row = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM scenarios WHERE project_id = ?').get(projectId) as {
    next: number;
  };
  return Number(row.next);
}

/**
 * Compare-and-swap the project revision. Returns false when another write got
 * there first, so the caller can roll back and report a conflict.
 */
export function bumpRevision(
  db: DatabaseSync,
  projectId: string,
  expectedRevision: number,
  updatedAt: string,
  options: { freezeBaseline?: boolean } = {},
): boolean {
  const result = db
    .prepare(
      `UPDATE projects
       SET revision = revision + 1, updated_at = ?, baseline_frozen = CASE WHEN ? THEN 1 ELSE baseline_frozen END
       WHERE id = ? AND revision = ?`,
    )
    .run(updatedAt, options.freezeBaseline ? 1 : 0, projectId, expectedRevision);
  return Number(result.changes) === 1;
}
