/**
 * Row-level persistence for projects and scenarios (Postgres, see db.ts).
 * Every function takes the connection or transaction to run on, so callers can
 * group several statements into one transaction.
 */
import type { Sql } from './db';
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

/** JSONB comes back parsed from both drivers; tolerate text just in case. */
const json = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

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
    baselineFrozen: row.baseline_frozen === true,
    demo: row.demo === true,
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
    workbook: json(row.workbook) as BakeryWorkbook,
    assumptions: json(row.assumptions) as Assumption[],
    calculation: json(row.calculation) as Calculation,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listProjects(db: Sql): Promise<ProjectRecord[]> {
  const { rows } = await db.query<Row>('SELECT * FROM projects ORDER BY updated_at DESC, created_at DESC');
  return rows.map(toProject);
}

export async function findProject(db: Sql, id: string): Promise<ProjectRecord | null> {
  const { rows } = await db.query<Row>('SELECT * FROM projects WHERE id = $1', [id]);
  return rows[0] ? toProject(rows[0]) : null;
}

export async function listScenarios(db: Sql, projectId: string): Promise<ScenarioRecord[]> {
  const { rows } = await db.query<Row>('SELECT * FROM scenarios WHERE project_id = $1 ORDER BY position', [projectId]);
  return rows.map(toScenario);
}

export async function findScenario(db: Sql, projectId: string, scenarioId: string): Promise<ScenarioRecord | null> {
  const { rows } = await db.query<Row>('SELECT * FROM scenarios WHERE project_id = $1 AND id = $2', [projectId, scenarioId]);
  return rows[0] ? toScenario(rows[0]) : null;
}

export async function insertProject(db: Sql, p: ProjectRecord): Promise<void> {
  await db.query(
    `INSERT INTO projects (id, name, currency, template_id, template_version, schema_version, revision,
       baseline_scenario_id, baseline_frozen, demo, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [p.id, p.name, p.currency, p.templateId, p.templateVersion, p.schemaVersion, p.revision, p.baselineScenarioId, p.baselineFrozen, p.demo, p.createdAt, p.updatedAt],
  );
}

export async function insertScenario(db: Sql, s: ScenarioRecord): Promise<void> {
  await db.query(
    `INSERT INTO scenarios (id, project_id, position, name, kind, parent_scenario_id, notes, workbook,
       assumptions, calculation, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12)`,
    [
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
    ],
  );
}

export async function updateScenarioContent(
  db: Sql,
  s: Pick<ScenarioRecord, 'id' | 'projectId' | 'name' | 'notes' | 'workbook' | 'assumptions' | 'calculation' | 'updatedAt'>,
): Promise<void> {
  await db.query(
    `UPDATE scenarios SET name = $1, notes = $2, workbook = $3::jsonb, assumptions = $4::jsonb, calculation = $5::jsonb, updated_at = $6
     WHERE id = $7 AND project_id = $8`,
    [s.name, s.notes, JSON.stringify(s.workbook), JSON.stringify(s.assumptions), JSON.stringify(s.calculation), s.updatedAt, s.id, s.projectId],
  );
}

export async function nextScenarioPosition(db: Sql, projectId: string): Promise<number> {
  const { rows } = await db.query<{ next: number }>('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM scenarios WHERE project_id = $1', [projectId]);
  return Number(rows[0].next);
}

/**
 * Compare-and-swap the project revision. Returns false when another write got
 * there first, so the caller can roll back and report a conflict. In Postgres
 * a concurrent writer waits on the row lock and then re-checks the revision.
 */
export async function bumpRevision(
  db: Sql,
  projectId: string,
  expectedRevision: number,
  updatedAt: string,
  options: { freezeBaseline?: boolean } = {},
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE projects
     SET revision = revision + 1, updated_at = $1, baseline_frozen = (baseline_frozen OR $2)
     WHERE id = $3 AND revision = $4`,
    [updatedAt, Boolean(options.freezeBaseline), projectId, expectedRevision],
  );
  return rowCount === 1;
}
