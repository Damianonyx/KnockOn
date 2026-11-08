'use client';
/**
 * Project workspace: scenario list, the real Univer spreadsheet, linked input
 * controls, metric cards, result inspection, scenario forks, and comparison.
 *
 * State model
 * - The saved project comes from the API and is replaced by every mutation
 *   response (canonical server calculation for that revision).
 * - The active scenario's draft lives in the browser Univer workbook plus a
 *   small draft of assumptions/notes/name. Controls and sheet edit the same
 *   workbook through the adapter.
 * - Metric cards show Univer's browser calculation of the draft; comparisons
 *   use saved, server-calculated results.
 */
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiClientError, errorMessage } from '@/lib/api/client';
import type { Assumption, Project, Scenario } from '@/lib/contracts/project';
import { formatDateTime } from '@/lib/format';
import {
  baselineOf,
  changedInputs,
  confirmMonthlyUnits,
  findScenario,
  isReadOnly,
  KIND_LABEL,
  parentOf,
  priceConfirmation,
  sameAssumptions,
  upsertAssumption,
} from '@/lib/scenarios';
import { BAKERY_INPUTS, BAKERY_RESULTS, type BakeryInputKey, type BakeryResultKey } from '@/lib/templates/bakery';
import type { BrowserWorkbookAdapter } from '@/lib/univer/browser/adapter';
import { inspectResult, resultKeyForCell } from '@/lib/univer/inspect';
import { validateBakerySnapshot } from '@/lib/univer/snapshot';
import { AppHeader } from '@/components/ui/AppHeader';
import { Dialog } from '@/components/ui/Dialog';
import { ComparisonCharts, ComparisonView } from './ComparisonView';
import { ForkDialog, type ForkSpec } from './ForkDialog';
import { InputsPanel } from './InputsPanel';
import { InspectPanel } from './InspectPanel';
import { MetricCards } from './MetricCards';
import { ScenarioList } from './ScenarioList';
import type { InspectTarget, LiveState, SaveProblem, SaveState } from './types';

const SpreadsheetEditor = dynamic(() => import('./SpreadsheetEditor'), {
  ssr: false,
  loading: () => (
    <div className="sheet-overlay">
      <span className="spinner" aria-hidden /> Loading spreadsheet…
    </div>
  ),
});

type LoadState = { status: 'loading' } | { status: 'error'; message: string; notFound: boolean } | { status: 'ready' };
type View = 'model' | 'compare';
type Pending = { type: 'switch'; scenarioId: string } | { type: 'fork'; kind: 'shock' | 'response'; sourceId: string };

interface Draft {
  scenarioId: string;
  name: string;
  notes: string;
  assumptions: Assumption[];
}

const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  failed: 'Save failed',
  conflict: 'Save conflict',
  readonly: 'Read-only',
};

function readLive(adapter: BrowserWorkbookAdapter): LiveState {
  const projection = adapter.readProjection();
  const inputs = {} as Record<BakeryInputKey, number | null>;
  const raw = {} as Record<BakeryInputKey, unknown>;
  for (const m of BAKERY_INPUTS) {
    inputs[m.key as BakeryInputKey] = adapter.getInput(m.key as BakeryInputKey);
    raw[m.key as BakeryInputKey] = adapter.getRawInput(m.key as BakeryInputKey);
  }
  const validation = validateBakerySnapshot(adapter.exportSnapshot());
  return {
    inputs,
    raw,
    metrics: projection.metrics,
    errors: projection.errors,
    issues: validation.ok ? [] : validation.issues,
  };
}

function problemFrom(error: unknown): SaveProblem {
  if (error instanceof ApiClientError) {
    return { message: error.message, code: error.code, fields: error.fields, invalidCells: error.invalidCells };
  }
  return { message: errorMessage(error), fields: {}, invalidCells: [] };
}

export function Workspace({ projectId, univerLicense }: { projectId: string; univerLicense: string }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [project, setProject] = useState<Project | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>('model');
  const [adapter, setAdapter] = useState<BrowserWorkbookAdapter | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [sheetLoading, setSheetLoading] = useState(true);
  const [live, setLive] = useState<LiveState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [workbookDirty, setWorkbookDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<SaveProblem | null>(null);
  const [conflict, setConflict] = useState<{ currentRevision?: number } | null>(null);
  const [inspect, setInspect] = useState<InspectTarget | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [forking, setForking] = useState<{ kind: 'shock' | 'response'; sourceId: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);

  const editVersion = useRef(0);
  const loadedKey = useRef<string | null>(null);
  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;

  const active = project ? findScenario(project, activeId) : undefined;
  const parent = project && active ? parentOf(project, active) : undefined;
  const baseline = project ? baselineOf(project) : undefined;
  const readOnly = Boolean(project && active && isReadOnly(project, active));
  const metaDirty = Boolean(
    draft && active && draft.scenarioId === active.id &&
      (draft.name !== active.name || draft.notes !== active.notes || !sameAssumptions(draft.assumptions, active.assumptions)),
  );
  const dirty = !readOnly && (workbookDirty || metaDirty);
  const saveState: SaveState = readOnly
    ? 'readonly'
    : saving
      ? 'saving'
      : conflict
        ? 'conflict'
        : problem
          ? 'failed'
          : dirty
            ? 'unsaved'
            : 'saved';

  // ---------- Toast ----------
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------- Load project ----------
  const fetchProject = useCallback(async () => {
    setLoad({ status: 'loading' });
    try {
      const p = await api.getProject(projectId);
      setProject(p);
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get('scenario');
      setActiveId(wanted && p.scenarios.some((s) => s.id === wanted) ? wanted : p.baselineScenarioId);
      if (params.get('view') === 'compare') setView('compare');
      setLoad({ status: 'ready' });
    } catch (error) {
      setLoad({
        status: 'error',
        message: errorMessage(error),
        notFound: error instanceof ApiClientError && error.status === 404,
      });
    }
  }, [projectId]);

  useEffect(() => {
    void fetchProject();
  }, [fetchProject]);

  // Keep the URL in sync so a reload reopens the same scenario and view.
  useEffect(() => {
    if (!activeId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('scenario', activeId);
    if (view === 'compare') url.searchParams.set('view', 'compare');
    else url.searchParams.delete('view');
    window.history.replaceState(null, '', url);
  }, [activeId, view]);

  // ---------- Adapter wiring ----------
  const refreshLive = useCallback(() => {
    if (!adapter) return;
    try {
      setLive(readLive(adapter));
    } catch {
      /* no workbook loaded yet */
    }
  }, [adapter]);

  useEffect(() => {
    if (!adapter) return;
    const offChange = adapter.onChange(() => {
      editVersion.current += 1;
      setWorkbookDirty(true);
      setProblem(null);
      refreshLive();
    });
    const offCalc = adapter.onCalculated(refreshLive);
    const offBlocked = adapter.onBlockedEdit((message) => setToast(message));
    const offSelect = adapter.onSelect(({ row, col }) => {
      const key = resultKeyForCell(row, col);
      if (key) setInspect({ key, source: 'draft' });
    });
    return () => {
      offChange();
      offCalc();
      offBlocked();
      offSelect();
    };
  }, [adapter, refreshLive]);

  /** Load a scenario's saved workbook into Univer and reset the draft to it. */
  const loadScenario = useCallback(
    async (p: Project, scenario: Scenario, opts: { silent?: boolean } = {}) => {
      if (!adapter) return;
      if (!opts.silent) setSheetLoading(true);
      try {
        adapter.setReadOnly(isReadOnly(p, scenario));
        await adapter.load(scenario.workbook);
        editVersion.current = 0;
        setWorkbookDirty(false);
        setDraft({ scenarioId: scenario.id, name: scenario.name, notes: scenario.notes, assumptions: scenario.assumptions });
        setLive(readLive(adapter));
        loadedKey.current = `${scenario.id}`;
      } catch (error) {
        setEditorError(errorMessage(error));
      } finally {
        setSheetLoading(false);
      }
    },
    [adapter],
  );

  // Initial load (and after the editor remounts).
  useEffect(() => {
    if (!adapter || !project || !activeId) return;
    if (loadedKey.current === activeId) return;
    const scenario = findScenario(project, activeId);
    if (scenario) void loadScenario(project, scenario);
  }, [adapter, project, activeId, loadScenario]);

  useEffect(() => {
    if (!adapter) loadedKey.current = null;
  }, [adapter]);

  // ---------- Leaving with unsaved changes ----------
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // ---------- Save ----------
  /** Save one scenario's draft. Explicit arguments so the fork flow can save a scenario it just created. */
  const doSave = useCallback(
    async (p: Project, scenario: Scenario, parentScenario: Scenario | undefined, d: Draft): Promise<Project | null> => {
      if (!adapter || isReadOnly(p, scenario)) return null;
      const assumptions = d.assumptions;
      const snapshot = adapter.exportSnapshot();
      const validation = validateBakerySnapshot(snapshot);
      if (!validation.ok) {
        setProblem({
          message: 'Some cells need attention before this scenario can be saved.',
          code: 'VALIDATION_ERROR',
          fields: Object.fromEntries(validation.issues.map((i) => [i.field, i.message])),
          invalidCells: [],
        });
        return null;
      }
      const projection = adapter.readProjection();
      if (projection.errors.length) {
        setProblem({ message: 'Some formulas could not be calculated. Fix the inputs and save again.', code: 'CALCULATION_ERROR', fields: {}, invalidCells: projection.errors });
        return null;
      }
      const confirmation = priceConfirmation(readLive(adapter).inputs, parentScenario?.calculation.inputs, assumptions);
      if (confirmation.required && confirmation.status !== 'confirmed') {
        setProblem({
          message: 'Enter or confirm expected monthly sales for this price change.',
          code: 'ASSUMPTION_REQUIRED',
          fields: { 'assumptions.monthlyUnits': 'Confirmation required.' },
          invalidCells: [],
        });
        return null;
      }

      const versionAtStart = editVersion.current;
      setSaving(true);
      setProblem(null);
      try {
        const updated = await api.saveScenario(p.id, scenario.id, {
          expectedRevision: p.revision,
          name: d.name,
          notes: d.notes,
          workbook: snapshot,
          assumptions,
        });
        setProject(updated);
        projectRef.current = updated;
        setConflict(null);
        const saved = findScenario(updated, scenario.id);
        if (saved) {
          if (editVersion.current === versionAtStart) {
            // Replace the local preview with the canonical server result for this revision.
            await loadScenario(updated, saved, { silent: true });
          } else {
            // The user kept editing while saving: keep their newer draft, unsaved.
            setDraft((cur) => (cur ? { ...cur, assumptions: saved.assumptions } : cur));
          }
        }
        return updated;
      } catch (error) {
        if (error instanceof ApiClientError && error.isConflict) {
          setConflict({ currentRevision: error.currentRevision });
        } else {
          setProblem(problemFrom(error));
        }
        return null;
      } finally {
        setSaving(false);
      }
    },
    [adapter, loadScenario],
  );

  const save = useCallback(async (): Promise<Project | null> => {
    const p = projectRef.current;
    if (!p || !active || !draft) return null;
    return doSave(p, active, parent, draft);
  }, [active, draft, parent, doSave]);

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dirty, saving, save]);

  // ---------- Switching and discarding ----------
  const switchTo = useCallback(
    async (scenarioId: string) => {
      const p = projectRef.current;
      const target = p ? findScenario(p, scenarioId) : undefined;
      if (!p || !target) return;
      setProblem(null);
      setConflict(null);
      setInspect(null);
      setActiveId(scenarioId);
      await loadScenario(p, target);
    },
    [loadScenario],
  );

  const requestSwitch = (s: Scenario) => {
    if (s.id === activeId) {
      setView('model');
      return;
    }
    if (dirty) setPending({ type: 'switch', scenarioId: s.id });
    else {
      setView('model');
      void switchTo(s.id);
    }
  };

  const discard = useCallback(async () => {
    const p = projectRef.current;
    if (!p || !active) return;
    setProblem(null);
    await loadScenario(p, active);
  }, [active, loadScenario]);

  // ---------- Conflict recovery ----------
  const reloadLatest = useCallback(async () => {
    setBusyMessage('Loading the latest saved project…');
    try {
      const latest = await api.getProject(projectId);
      setProject(latest);
      setConflict(null);
      setProblem(null);
      const target = findScenario(latest, activeId) ?? baselineOf(latest);
      if (target) {
        setActiveId(target.id);
        await loadScenario(latest, target);
      }
    } catch (error) {
      setToast(errorMessage(error));
    } finally {
      setBusyMessage(null);
    }
  }, [projectId, activeId, loadScenario]);

  const keepMyEdits = useCallback(async () => {
    if (!adapter || !active || !draft) return;
    const mine = readLive(adapter).inputs;
    const myDraft = draft;
    setBusyMessage('Applying your edits to the latest saved version…');
    try {
      const latest = await api.getProject(projectId);
      const target = findScenario(latest, active.id);
      setProject(latest);
      setConflict(null);
      if (!target) {
        setToast('This scenario no longer exists in the latest version.');
        return;
      }
      if (isReadOnly(latest, target)) {
        setToast('In the latest version this baseline is frozen, so your edits cannot be applied. Start a new project to change it.');
        await loadScenario(latest, target);
        return;
      }
      await loadScenario(latest, target);
      const changes: Partial<Record<BakeryInputKey, number>> = {};
      for (const m of BAKERY_INPUTS) {
        const v = mine[m.key as BakeryInputKey];
        if (typeof v === 'number' && v !== target.calculation.inputs[m.key]) changes[m.key as BakeryInputKey] = v;
      }
      if (Object.keys(changes).length) await adapter.setInputs(changes);
      setDraft({ ...myDraft, scenarioId: target.id });
      setToast('Your edits are on the latest version. Review them, then save.');
    } catch (error) {
      setToast(errorMessage(error));
    } finally {
      setBusyMessage(null);
    }
  }, [adapter, active, draft, projectId, loadScenario]);

  // ---------- Input controls ----------
  const commitInput = useCallback(
    async (key: BakeryInputKey, value: number) => {
      if (!adapter) return;
      await adapter.setInput(key, value);
      refreshLive();
    },
    [adapter, refreshLive],
  );

  const confirmUnits = useCallback(
    async (monthlyUnits: number, note: string) => {
      if (!adapter || !draft) return;
      const price = adapter.getInput('unitPrice');
      if (price === null) throw new Error('Enter a valid price first.');
      if (adapter.getInput('monthlyUnits') !== monthlyUnits) await adapter.setInput('monthlyUnits', monthlyUnits);
      setDraft({ ...draft, assumptions: confirmMonthlyUnits(draft.assumptions, price, monthlyUnits, note) });
      setProblem(null);
      refreshLive();
    },
    [adapter, draft, refreshLive],
  );

  // ---------- Forks ----------
  const requestFork = (kind: 'shock' | 'response', sourceId: string) => {
    if (dirty) setPending({ type: 'fork', kind, sourceId });
    else setForking({ kind, sourceId });
  };

  const performFork = useCallback(
    async (spec: ForkSpec) => {
      const p = projectRef.current;
      if (!p || !adapter) return;
      let forked: Project;
      try {
        forked = await api.forkScenario(p.id, {
          expectedRevision: p.revision,
          sourceScenarioId: spec.sourceId,
          kind: spec.kind,
          name: spec.name,
        });
      } catch (error) {
        if (error instanceof ApiClientError && error.isConflict) {
          setForking(null);
          setConflict({ currentRevision: error.currentRevision });
          return;
        }
        throw error;
      }
      const known = new Set(p.scenarios.map((s) => s.id));
      const created = forked.scenarios.find((s) => !known.has(s.id));
      setProject(forked);
      projectRef.current = forked;
      setForking(null);
      if (!created) return;
      setView('model');
      setInspect(null);
      setProblem(null);
      setActiveId(created.id);
      await loadScenario(forked, created);
      if (Object.keys(spec.changes).length === 0) {
        setToast(`“${created.name}” created. Edit its inputs, then save.`);
        return;
      }
      await adapter.setInputs(spec.changes);
      let assumptions = created.assumptions;
      for (const a of spec.assumptions) assumptions = upsertAssumption(assumptions, a);
      const createdDraft: Draft = { scenarioId: created.id, name: created.name, notes: created.notes, assumptions };
      setDraft(createdDraft);
      setLive(readLive(adapter));
      const result = await doSave(forked, created, findScenario(forked, spec.sourceId), createdDraft);
      if (result) setToast(`“${created.name}” created and saved.`);
    },
    [adapter, loadScenario, doSave],
  );

  // ---------- Inspection ----------
  const inspection = useMemo(() => {
    if (!inspect || !project) return null;
    if (inspect.source === 'draft') return live ? inspectResult(inspect.key, live) : null;
    const s = findScenario(project, inspect.scenarioId);
    return s ? inspectResult(inspect.key, { inputs: s.calculation.inputs, metrics: s.calculation.metrics }) : null;
  }, [inspect, live, project]);
  const inspectContext = useMemo(() => {
    if (!inspect || !project) return '';
    if (inspect.source === 'draft') return `${active?.name ?? ''} · ${dirty ? 'unsaved draft, calculated in your browser by Univer' : 'saved'}`;
    const s = findScenario(project, inspect.scenarioId);
    return `${s?.name ?? ''} · saved, calculated on the server by Univer`;
  }, [inspect, project, active, dirty]);

  // ---------- Render ----------
  if (load.status === 'loading' && !project) {
    return (
      <>
        <AppHeader />
        <div className="center-state" role="status">
          <span className="spinner" aria-hidden /> Loading project…
        </div>
      </>
    );
  }
  if (load.status === 'error' && !project) {
    return (
      <>
        <AppHeader />
        <main className="page">
          <div className="banner banner-error" role="alert">
            <div className="banner-body">
              <strong>{load.notFound ? 'Project not found.' : 'Could not load this project.'}</strong>
              <span>{load.message}</span>
              <div className="banner-actions">
                {!load.notFound && (
                  <button type="button" className="btn btn-sm" onClick={() => void fetchProject()}>
                    Try again
                  </button>
                )}
                <Link href="/projects" className="btn btn-sm">
                  All projects
                </Link>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }
  if (!project || !active) return null;

  const shocks = project.scenarios.filter((s) => s.kind === 'shock');
  const responseSource = active.kind === 'shock' ? active : active.kind === 'response' ? parent : shocks[0];
  const priceState = live ? priceConfirmation(live.inputs, parent?.calculation.inputs, draft?.assumptions ?? []) : ({ required: false } as const);
  const allZero = live ? BAKERY_INPUTS.every((m) => live.inputs[m.key as BakeryInputKey] === 0) : false;
  const changes = live ? changedInputs(live.inputs, parent?.calculation.inputs) : [];
  const fieldProblems = problem?.fields ?? {};
  const pendingTarget = pending?.type === 'switch' ? findScenario(project, pending.scenarioId) : undefined;

  return (
    <>
      <AppHeader>
        <div className="header-crumb">
          <span aria-hidden>/</span>
          <strong title={project.name}>{project.name}</strong>
          <span className="badge" style={{ background: '#0d4452', color: '#cfe0e2' }}>
            {project.currency}
          </span>
          {project.demo && <span className="badge badge-demo">Fictional demo data</span>}
        </div>
        <span className="spacer" />
        <span className="save-state" data-state={saveState} role="status" aria-live="polite">
          <span className="dot" aria-hidden />
          {SAVE_LABEL[saveState]}
        </span>
        {!readOnly && (
          <button type="button" className="btn btn-accent btn-sm" onClick={() => void save()} disabled={!dirty || saving} title="Save (Ctrl+S)">
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </AppHeader>

      <div className="ws">
        <aside className="ws-side" aria-label="Project navigation">
          <div className="tabs" role="tablist" aria-label="Workspace view">
            <button type="button" role="tab" aria-selected={view === 'model'} onClick={() => setView('model')}>
              Model
            </button>
            <button type="button" role="tab" aria-selected={view === 'compare'} onClick={() => setView('compare')}>
              Compare
            </button>
          </div>
          <span className="side-section-title">Scenarios</span>
          <ScenarioList project={project} activeId={active.id} dirtyId={dirty ? active.id : null} onSelect={requestSwitch} />
          <span className="side-section-title">Add</span>
          <div className="side-actions">
            <button type="button" className="btn btn-sm" onClick={() => requestFork('shock', project.baselineScenarioId)}>
              + Shock from baseline
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!responseSource}
              onClick={() => responseSource && requestFork('response', responseSource.id)}
              title={responseSource ? `Response to “${responseSource.name}”` : 'Create a shock first'}
            >
              + Response{responseSource ? ` to “${responseSource.name.length > 16 ? `${responseSource.name.slice(0, 15)}…` : responseSource.name}”` : ''}
            </button>
          </div>
          <Link href="/projects" className="small" style={{ marginTop: 'auto' }}>
            ← All projects
          </Link>
        </aside>

        <main className="ws-main">
          {conflict && (
            <div className="banner banner-error" role="alert">
              <div className="banner-body">
                <strong>This project was changed elsewhere.</strong>
                <span>
                  A newer version{conflict.currentRevision ? ` (revision ${conflict.currentRevision})` : ''} was saved, for
                  example in another tab. Nothing was overwritten, and your draft is still here, unsaved.
                </span>
                <div className="banner-actions">
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => void keepMyEdits()} disabled={Boolean(busyMessage)}>
                    Apply my edits to the latest version
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => void reloadLatest()} disabled={Boolean(busyMessage)}>
                    Discard my draft and reload
                  </button>
                </div>
              </div>
            </div>
          )}
          {busyMessage && (
            <div className="banner banner-info" role="status">
              <span className="spinner" aria-hidden />
              <div className="banner-body">{busyMessage}</div>
            </div>
          )}

          {view === 'compare' && (
            <>
              <div className="ws-head">
                <div className="ws-title">
                  <h1>Compare scenarios</h1>
                  <span className="small muted">Baseline, shocks and responses side by side, from saved results.</span>
                </div>
              </div>
              <div className="model-grid">
                <ComparisonView
                  project={project}
                  inspect={inspect}
                  dirtyName={dirty ? active.name : null}
                  onInspect={(t) => setInspect(t)}
                />
                <InspectPanel inspection={inspect?.source === 'saved' ? inspection : null} contextLabel={inspectContext} currency={project.currency} onClose={() => setInspect(null)} />
              </div>
              <ComparisonCharts project={project} />
            </>
          )}

          <div style={{ display: view === 'model' ? 'contents' : 'none' }}>
            <div className="ws-head">
              <div className="ws-title">
                <h1>
                  {active.name}
                  <span className={`badge badge-kind-${active.kind}`}>{KIND_LABEL[active.kind]}</span>
                  {readOnly && <span className="badge badge-locked">🔒 Read-only</span>}
                </h1>
                <span className="small muted">
                  {parent ? `Forked from “${parent.name}”. ` : ''}
                  Last saved {formatDateTime(active.updatedAt)} · project revision {project.revision}
                </span>
              </div>
              {!readOnly && dirty && (
                <div className="row">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => void discard()} disabled={saving}>
                    Discard changes
                  </button>
                </div>
              )}
            </div>

            {project.demo && (
              <div className="banner banner-demo">
                <div className="banner-body">
                  <strong>Fictional demo figures</strong>
                  <span>These numbers are made up for learning. They are not real business data or estimates.</span>
                </div>
              </div>
            )}
            {readOnly && (
              <div className="banner banner-info">
                <div className="banner-body">
                  <strong>The baseline is frozen.</strong>
                  <span>
                    Other scenarios are compared against it, so it can no longer change. You can still inspect every formula.
                    To start from different figures, create a new project.
                  </span>
                </div>
              </div>
            )}
            {!project.demo && allZero && active.kind === 'baseline' && !readOnly && (
              <div className="banner banner-info">
                <div className="banner-body">
                  <strong>No figures entered yet.</strong>
                  <span>All inputs start at zero. Enter your own figures in column B of the sheet or with the input controls.</span>
                </div>
              </div>
            )}
            {problem && (
              <div className="banner banner-error" role="alert">
                <div className="banner-body">
                  <strong>{problem.code === 'NETWORK_ERROR' ? 'Not saved — network problem.' : 'Not saved.'}</strong>
                  <span>{problem.message} Your draft is kept.</span>
                  {(Object.keys(problem.fields).length > 0 || problem.invalidCells.length > 0) && (
                    <ul>
                      {Object.entries(problem.fields).map(([field, message]) => (
                        <li key={field}>
                          <span className="mono">{field.replace(/^workbook\./, '')}</span>: {message}
                        </li>
                      ))}
                      {problem.invalidCells.map((c) => (
                        <li key={c.cell}>{c.message}</li>
                      ))}
                    </ul>
                  )}
                  <div className="banner-actions">
                    <button type="button" className="btn btn-sm" onClick={() => void save()} disabled={saving}>
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            )}
            {live && live.errors.length > 0 && !problem && (
              <div className="banner banner-error" role="alert">
                <div className="banner-body">
                  <strong>Formula error</strong>
                  <span>{live.errors.map((e) => e.message).join(' ')}</span>
                </div>
              </div>
            )}

            <MetricCards
              metrics={live?.metrics ?? null}
              errors={live?.errors ?? []}
              currency={project.currency}
              baselineProfit={baseline?.calculation.metrics.profit ?? null}
              isBaseline={active.kind === 'baseline'}
              activeKey={inspect?.source === 'draft' ? inspect.key : null}
              onInspect={(key: BakeryResultKey) => setInspect({ key, source: 'draft' })}
            />
            <p className="tiny muted" style={{ marginTop: -6 }}>
              {dirty
                ? 'Preview of your unsaved draft, calculated by Univer in your browser. Saving recalculates it on the server.'
                : 'Saved results, calculated by Univer.'}{' '}
              Profit change compares against the saved baseline.
            </p>

            <div className="model-grid">
              <div className="stack" style={{ gap: 14, minWidth: 0 }}>
                <section className="card sheet-card" aria-label="Spreadsheet">
                  <div className="sheet-card-head">
                    <h2 style={{ fontSize: '1rem' }}>Spreadsheet</h2>
                    <span className="tiny muted">
                      {readOnly ? 'Read-only. Click a result cell to inspect it.' : 'Edit the blue input cells B2:B9. Labels and formulas are fixed.'}
                    </span>
                  </div>
                  <div className="sheet-scroll">
                    <div className="sheet-host">
                      {editorError ? (
                        <div className="sheet-overlay" role="alert" style={{ flexDirection: 'column', padding: 20, textAlign: 'center' }}>
                          <strong>The spreadsheet could not start.</strong>
                          <span className="small">{editorError}</span>
                          <button type="button" className="btn btn-sm" onClick={() => window.location.reload()}>
                            Reload page
                          </button>
                        </div>
                      ) : (
                        <>
                          <SpreadsheetEditor license={univerLicense} onReady={setAdapter} onError={setEditorError} />
                          {sheetLoading && (
                            <div className="sheet-overlay" role="status">
                              <span className="spinner" aria-hidden /> Calculating…
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="sheet-foot">
                    <span>Univer spreadsheet · formulas in B11:B16</span>
                    {changes.length > 0 && <span>{changes.length} input{changes.length === 1 ? '' : 's'} differ from “{parent?.name}”</span>}
                    <span>Ctrl+S to save</span>
                  </div>
                </section>
                {!readOnly && draft && (
                  <section className="card panel" aria-labelledby="details-heading">
                    <div className="panel-head">
                      <h3 id="details-heading">Scenario details</h3>
                    </div>
                    <div className="panel-body">
                      <div className="field">
                        <label htmlFor="scn-name">Name</label>
                        <input
                          id="scn-name"
                          value={draft.name}
                          maxLength={80}
                          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          aria-invalid={Boolean(fieldProblems.name) || draft.name.trim() === ''}
                        />
                        {draft.name.trim() === '' && <span className="error-text">Name is required.</span>}
                      </div>
                      <div className="field">
                        <label htmlFor="scn-notes">Notes</label>
                        <textarea id="scn-notes" value={draft.notes} maxLength={5000} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                      </div>
                    </div>
                  </section>
                )}
                {readOnly && active.notes && (
                  <section className="card card-pad small">
                    <strong>Notes:</strong> <span className="muted">{active.notes}</span>
                  </section>
                )}
              </div>
              <div className="stack" style={{ gap: 14, minWidth: 0 }}>
                <InspectPanel
                  inspection={inspect?.source === 'draft' ? inspection : null}
                  contextLabel={inspectContext}
                  currency={project.currency}
                  onClose={() => setInspect(null)}
                />
                <InputsPanel
                  live={live}
                  parentInputs={parent?.calculation.inputs}
                  parentName={parent?.name}
                  readOnly={readOnly || sheetLoading}
                  currency={project.currency}
                  priceState={priceState}
                  assumptions={draft?.assumptions ?? active.assumptions}
                  parentAssumptions={parent?.assumptions}
                  serverFields={fieldProblems}
                  onCommit={commitInput}
                  onConfirmUnits={confirmUnits}
                />
                <details className="card card-pad small">
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>What this template assumes</summary>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }} className="muted">
                    <li>All costs are monthly except ingredient cost per unit.</li>
                    <li>One product; every unit entered is sold.</li>
                    <li>Energy, rent, wages, other expenses and delivery are independent monthly inputs.</li>
                    <li>Waste, tax, financing, seasonality and volume-driven energy use are not modelled.</li>
                    <li>A price change never changes sales automatically — you enter expected sales.</li>
                  </ul>
                </details>
              </div>
            </div>
          </div>
        </main>
      </div>

      {pending && (
        <Dialog
          title="Save your changes first?"
          description={
            pending.type === 'switch'
              ? `“${active.name}” has unsaved changes. Save them before opening “${pendingTarget?.name ?? 'another scenario'}”, or discard them.`
              : `New scenarios are copied from the saved version. Save “${active.name}” first so your changes are included, or discard them.`
          }
          onClose={() => setPending(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setPending(null)} data-close>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  const next = pending;
                  setPending(null);
                  await discard();
                  if (next.type === 'switch') {
                    setView('model');
                    await switchTo(next.scenarioId);
                  } else setForking({ kind: next.kind, sourceId: next.sourceId });
                }}
              >
                Discard changes
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={async () => {
                  const next = pending;
                  setPending(null);
                  const saved = await save();
                  if (!saved) return;
                  if (next.type === 'switch') {
                    setView('model');
                    await switchTo(next.scenarioId);
                  } else setForking({ kind: next.kind, sourceId: next.sourceId });
                }}
              >
                Save and continue
              </button>
            </>
          }
        />
      )}

      {forking && findScenario(project, forking.sourceId) && (
        <ForkDialog
          project={project}
          kind={forking.kind}
          source={findScenario(project, forking.sourceId)!}
          onCancel={() => setForking(null)}
          onSubmit={performFork}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
          <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'inherit' }} onClick={() => setToast(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </>
  );
}

// Exported for tests that check the result list order matches the template.
export const RESULT_ORDER = BAKERY_RESULTS.map((r) => r.key);
