'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiClientError, errorMessage } from '@/lib/api/client';
import { createProjectRequestSchema, type ProjectSummary } from '@/lib/contracts/project';
import { BAKERY_TEMPLATE_ID } from '@/lib/templates/bakery';
import { formatDateTime } from '@/lib/format';
import { AppHeader } from '@/components/ui/AppHeader';
import { KnockyPose } from '@/components/ui/KnockyPose';

const CURRENCIES = ['GBP', 'EUR', 'USD', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'JPY', 'INR', 'ZAR', 'SGD'];

type ListState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; projects: ProjectSummary[] };

export function ProjectsHome() {
  const router = useRouter();
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [initialData, setInitialData] = useState<'demo' | 'blank'>('demo');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setList({ status: 'loading' });
    try {
      setList({ status: 'ready', projects: await api.listProjects() });
    } catch (error) {
      setList({ status: 'error', message: errorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const body = { name, currency, templateId: BAKERY_TEMPLATE_ID, initialData };
    const parsed = createProjectRequestSchema.safeParse(body);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] ??= issue.message;
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setCreating(true);
    try {
      const project = await api.createProject(parsed.data);
      router.push(`/projects/${project.id}`);
    } catch (error) {
      if (error instanceof ApiClientError && Object.keys(error.fields).length) setFieldErrors(error.fields);
      setFormError(errorMessage(error));
      setCreating(false);
    }
  }

  return (
    <>
      <AppHeader />
      <main className="page">
        <div className="hero hero-knocky">
          {!(list.status === 'ready' && list.projects.length === 0) && <KnockyPose pose="hello" width={104} />}
          <h1>Your projects</h1>
        </div>
        <div className="projects-grid">
          <section className="card" aria-labelledby="saved-heading">
            <div className="card-pad" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 id="saved-heading">Saved projects</h2>
            </div>
            {list.status === 'loading' && (
              <div className="center-state" role="status">
                <span className="spinner" aria-hidden />
                Loading projects…
              </div>
            )}
            {list.status === 'error' && (
              <div className="card-pad">
                <div className="banner banner-error" role="alert">
                  <KnockyPose pose="whoa" width={64} />
                  <div className="banner-body">
                    <strong>Could not load projects.</strong>
                    <span>{list.message}</span>
                  </div>
                  <button type="button" className="btn btn-sm" onClick={() => void load()}>
                    Try again
                  </button>
                </div>
              </div>
            )}
            {list.status === 'ready' && list.projects.length === 0 && (
              <div className="center-state">
                <KnockyPose pose="hello" width={160} />
                <strong style={{ color: 'var(--text)' }}>No projects yet</strong>
                <span>Create your first project with the form. The fictional bakery is a good place to start.</span>
              </div>
            )}
            {list.status === 'ready' && list.projects.length > 0 && (
              <ul className="project-list">
                {list.projects.map((p) => (
                  <li key={p.id}>
                    <Link className="project-link" href={`/projects/${p.id}`}>
                      <div className="stack" style={{ gap: 2 }}>
                        <span className="name">{p.name}</span>
                        <span className="meta">
                          {p.templateId === BAKERY_TEMPLATE_ID ? 'Bakery' : p.templateId} · {p.currency} · updated{' '}
                          {formatDateTime(p.updatedAt)} · revision {p.revision}
                        </span>
                      </div>
                      <span className="chev" aria-hidden>
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card card-pad" aria-labelledby="create-heading">
            <form className="stack" onSubmit={onCreate} noValidate>
              <h2 id="create-heading">New project</h2>
              <div className="field">
                <label htmlFor="p-name">Project name</label>
                <input
                  id="p-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Corner Bakery"
                  maxLength={80}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? 'p-name-err' : undefined}
                />
                {fieldErrors.name && (
                  <span className="error-text" id="p-name-err">
                    {fieldErrors.name}
                  </span>
                )}
              </div>
              <div className="field">
                <label htmlFor="p-currency">Currency</label>
                <input
                  id="p-currency"
                  list="currency-options"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                  aria-invalid={Boolean(fieldErrors.currency)}
                  style={{ maxWidth: 140 }}
                />
                <datalist id="currency-options">
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                {fieldErrors.currency && <span className="error-text">{fieldErrors.currency}</span>}
              </div>
              <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="field-label" style={{ marginBottom: 6 }}>
                  Starting figures
                </legend>
                <div className="radio-cards">
                  <label className="radio-card">
                    <input type="radio" name="initial" checked={initialData === 'demo'} onChange={() => setInitialData('demo')} />
                    <div>
                      <strong>Fictional demo bakery</strong>
                      <span>Made-up figures for learning. Not real business data.</span>
                    </div>
                  </label>
                  <label className="radio-card">
                    <input type="radio" name="initial" checked={initialData === 'blank'} onChange={() => setInitialData('blank')} />
                    <div>
                      <strong>Blank</strong>
                      <span>All inputs start at zero; you enter your own figures.</span>
                    </div>
                  </label>
                </div>
              </fieldset>
              {formError && (
                <div className="banner banner-error" role="alert">
                  <div className="banner-body">{formError}</div>
                </div>
              )}
              <div>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating…' : 'Create project'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </>
  );
}
