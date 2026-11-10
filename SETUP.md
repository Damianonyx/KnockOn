# KnockOn configuration

For a fresh checkout, copy `.env.example` to `.env` and enter your Univer license contents and AntLing API key. If `.env` already exists, edit it directly. The model is configured as `Ling-3.2-flash`. Only the template belongs in version control; `.gitignore` excludes environment files and licenses.

| Variable | Value |
| --- | --- |
| `UNIVER_LICENSE` | Full contents of your `license.txt` file. |
| `UNIVER_LICENSE_KEY` | Full contents of your `licenseKey.txt` file. |
| `ANTLING_API_KEY` | Your API key from AntLing's console. |
| `ANTLING_BASE_URL` | `https://api.ant-ling.com/v1` for direct AntLing API access. |
| `ANTLING_MODEL` | `Ling-3.2-flash`; already configured. |

AntLing's [official API model listing](https://developer.ant-ling.com/en/docs/faq/), checked on November 6, 2026, confirms `Ling-3.2-flash`. Both `.env` and `.env.example` use that exact, case-sensitive ID. Access with your account still needs a live API check after you add the key.

The backend is implemented: server-side Univer calculation, Postgres storage, the project API, and Ling explanations. The browser spreadsheet editor and the MVP interface are implemented as well (projects, workspace, scenarios, comparison, inspection, and Ling explanations). Next.js loads `.env` automatically; restart the app after editing it. Hosted deployments need the same values entered in their environment settings.

## Run the app

Requires Node.js 22.13 or later.

```bash
npm ci                 # install the exact locked dependencies
cp .env.example .env   # first time only, then fill in your values
npm run dev            # http://localhost:3000, API under /api
```

| Command | What it does |
| --- | --- |
| `npm test` | Runs the backend tests (the bakery fixtures, saving and reloading, and every validation rule) and the interface helper tests (formatting, result inspection, the price-confirmation rule, scenario ordering). No server or API key needed. |
| `npm run typecheck` | Checks the TypeScript. |
| `npm run build` then `npm start` | Production build and server. |
| `npm run e2e` | With the app running, drives the full bakery workflow in a real browser (Playwright + Chromium): create, edit in the sheet and controls, save, shock, price and supplier responses, frozen baseline, inspect, compare, reload, plus validation, zero revenue, a loss, network failure, a save conflict, and phone layout. Set `BASE_URL` for another port, `E2E_SCREENSHOTS=1` to save screenshots to `verify-results/`, `E2E_HEADED=1` to watch. It creates a demo project in your database. On a fresh machine, run `npx playwright install chromium` once first. |
| `npm run smoke:api` | With the app running, runs the full bakery workflow over HTTP. Set `BASE_URL` for a port other than 3000. It creates a demo project in your database. |
| `npm run e2e:pro` | Checks chart saving, scenario copying, print preview, an actual licensed Excel download, export ownership and mobile layout. Both Univer license variables must be configured. Creates a demo project but uses no Ling credits. Set `BASE_URL` for another server and `CHROMIUM_PATH` to use an existing Chromium installation. |

Projects are stored in Postgres:

- **Hosted:** set `DATABASE_URL` to a Postgres connection string. On Vercel, connecting a Neon database (below) sets it for you.
- **Local runs and tests:** without `DATABASE_URL`, an embedded Postgres (PGlite) keeps data in `KNOCKON_DATABASE_PATH` (default `./data/pglite`), created on first run and excluded from Git. Delete that folder to start over.

The schema is created and upgraded automatically on first use (`schema_migrations` records the version). Every save and its revision check run in one transaction, so two simultaneous saves can never both win.

### Privacy and limits

There are no accounts. Each browser gets a random private ID in an HttpOnly cookie (`ko_owner`), and projects are stored with a hash of it. A visitor only ever sees, edits and explains their own projects; anyone else gets "not found". Clearing cookies or switching browsers starts with an empty list. Projects created before this change have no owner and are no longer listed.

Explain calls Ling, which costs money, so it is limited per visitor, per network and site-wide. Counters live in the database, and a refused request is not counted. Defaults, and the optional variables that change them:

| Limit | Default | Variable |
| --- | --- | --- |
| Per visitor | 10 an hour | `EXPLAIN_LIMIT_PER_VISITOR_PER_HOUR` |
| Per network | 30 an hour | `EXPLAIN_LIMIT_PER_NETWORK_PER_HOUR` |
| Whole site | 300 a day | `EXPLAIN_LIMIT_SITE_PER_DAY` |

### Interface

Open http://localhost:3000 (or the port `npm start` reports). The pages are:

| Path | What it shows |
| --- | --- |
| `/` | Landing page: the "Meet KnockOn," hero with Knocky, the halftone domino mascot, and its intro animation, then "How it works" and an "Open app" section. |
| `/projects` | Saved projects and the create-project form. |
| `/projects/:projectId` | The workspace: scenario list with one "next step" button, Univer spreadsheet, input controls, metric cards, and the comparison table and chart below. Clicking a result opens its formula in a slide-in panel. The URL keeps the open scenario, so a reload returns to it. |

The landing hero draws Knocky's halftone dots on a canvas from a fixed-seed generator (`src/components/landing/halftone.ts`), so every browser draws the same mascot. Its intro plays once per page load; with reduced motion turned on in the device settings, the finished hero shows straight away. Fonts (Gloock and Inter) load through `next/font`.

The spreadsheet runs only in the browser (loaded with `next/dynamic` and `ssr: false`). Components talk to it through the editor adapter in `src/lib/univer/browser/adapter.ts`, which writes inputs into the real workbook, reads Univer's calculated results, blocks edits outside B2:B9, and keeps a frozen baseline read-only. The interface does no arithmetic of its own for revenue, costs, or profit: metric cards show the browser Univer calculation of the unsaved draft, and comparisons show the saved results the server calculated.

Browser-side Univer packages, all pinned to 1.4.0: `@univerjs/core`, `design`, `ui`, `docs`, `docs-ui`, `engine-render`, `engine-formula`, `sheets`, `sheets-ui`, `sheets-formula`, `sheets-formula-ui` (registers the cell editor), `themes`, and `@univerjs-pro/license`. The license plugin is registered only when `UNIVER_LICENSE` is set.

Interface code lives in `src/components/` (`landing/`, `projects/`, `workspace/`, `ui/`), with browser helpers in `src/lib/api/client.ts`, `src/lib/format.ts`, `src/lib/scenarios.ts`, and `src/lib/univer/inspect.ts`.

### API

All endpoints are described in [docs/API_CONTRACT.md](docs/API_CONTRACT.md): templates, projects, scenario forks and saves, and explanations. The server recalculates every saved workbook with Univer and ignores calculated values sent by the browser.

Explanations call Ling 3.2 Flash from the server at `POST /api/projects/:projectId/scenarios/:scenarioId/explanation`. In the app, the ✦ Explain button on a saved scenario opens the explanation in a slide-in panel; it is marked out of date after any later save, and is only fetched when someone taps Explain. Without `ANTLING_API_KEY` that route returns 503, the panel says explanations aren't available, and everything else keeps working. Each explanation uses API credits.

## Interface principles

Two rules guide the interface: cut settings pages, filter bars and mode switches (pick the right default and hide the rest), and never solve a design problem by adding more UI or a code problem by adding another layer. Remove parts until the right action is the only obvious one.

## Deploy on Vercel

Everything can be done from the Vercel dashboard, including on a phone:

1. **Import** the GitHub repository as a Vercel project (framework: Next.js, no settings to change).
2. **Database:** in the project, open **Storage**, choose **Create Database → Neon (Postgres)**, and connect it to this project for all environments. Vercel adds `DATABASE_URL` automatically. Tables are created on the first request.
3. **Environment variables** (Settings → Environment Variables), for Production and Preview:
   - `UNIVER_LICENSE`: the contents of `license.txt`.
   - `UNIVER_LICENSE_KEY`: the contents of `licenseKey.txt`, required by server-side Excel conversion. Keep it private.
   - `ANTLING_API_KEY`: your AntLing key (keep it here only; never in code).
   - Optional: `ANTLING_BASE_URL` and `ANTLING_MODEL` (defaults: `https://api.ant-ling.com/v1`, `Ling-3.2-flash`), `SITE_URL` if the site is not at `https://www.knockon.tech`, and the Explain limits under [Privacy and limits](#privacy-and-limits).
4. **Redeploy** so the new variables take effect.

If the database is missing, the app says so ("no database is connected") instead of losing projects. If the AntLing key is missing or wrong, Explain says explanations aren't available and the rest of the app keeps working.

## Univer

The Web SDK takes the contents of `license.txt` in its license plugin or advanced preset. Collaboration and Exchange server features use both files. When wiring the editor, pass only `UNIVER_LICENSE` to its browser configuration as required by Univer. Keep `UNIVER_LICENSE_KEY` and `ANTLING_API_KEY` on the server; never copy them into browser configuration or variables prefixed with `NEXT_PUBLIC_` or `VITE_`.

Setting an environment value does not establish that a license is valid or covers a specific domain or feature. Verify those when the SDK is integrated.

How the editor receives it: the project page (`src/app/projects/[projectId]/page.tsx`) is a server component that reads only `UNIVER_LICENSE` and passes it to the browser editor, which registers Univer's license plugin with it. Nothing else from the environment is passed to the browser, and no variable uses a `NEXT_PUBLIC_` prefix. Core editing works without the license; chart and print permissions follow Univer's licensing rules.

### Pro features

- **Charts:** Add overhead chart creates a Univer bar chart linked to A5:B9. These are monthly overheads; ingredient costs are calculated separately. Charts appear below the model, update with the cells, and are saved as Univer drawing/chart resources. Forks copy those resources and remap their workbook IDs. Frozen baselines reject chart edits as well as input edits. The server only accepts chart drawings with sources in that scenario's A1:B16.
- **Print / PDF:** opens Univer's worksheet print preview. Choose Next and the browser's Save as PDF or a printer. This prints the worksheet and its drawings, not the surrounding comparison UI or Ling explanation. The adapter awaits the exported print operation because the 1.4.0 Facade uses a synchronous call for that asynchronous operation.
- **Export Excel:** downloads a saved scenario. Unsaved changes disable the button. The server verifies ownership and the expected revision, then converts the persisted workbook with Univer Exchange. Formulas, cached server results, formatting and chart resources are included. It does not call Ling or modify the project.

All SDK packages are pinned to 1.4.0; the lockfile also pins the compatible native binding. Development and builds use Webpack: the expanded Pro bundle exhausted the 8 GB test workspace while compiling with Turbopack. Native conversion runs only in Node; `next.config.ts` keeps the binding external and traces its Linux artifacts into the export function.

The export service requires a currently valid commercial license and does not silently switch to the free export tier. Vercel has no persistent local filesystem, so the handler refuses metered subscriptions there; these need a persistent conversion server for Univer's usage ledger. The supplied license reports an unlimited export allowance until **3 December 2026**. Renew it before expiry. Runtime/storage/license failures return `EXPORT_UNAVAILABLE`; conversion failures return `EXPORT_FAILED`, with no automatic retries that might consume another export.

Set both license variables for a review branch's Preview environment as well as Production, then redeploy the corresponding environment. Existing Production-only variables are not inherited by previews. Never commit either credential or include `UNIVER_LICENSE_KEY` in client props.

[Univer license configuration](https://docs.univer.ai/server/license)

## Use Ling to help write the app

AntLing's API key can power a coding tool. For example, in the Kilo Code extension for VS Code, select **OpenAI Compatible** and enter:

- Base URL: `https://api.ant-ling.com/v1`
- API key: your AntLing key, through the extension's settings.
- Model ID: `Ling-3.2-flash`.

Open the project folder and give Ling a scoped development task, such as implementing scenario persistence or integrating the Univer editor. Configure the coding tool separately; merely adding `.env` does not select Ling in the editor.

AntLing also documents using Ling through Claude Code with its Anthropic-compatible endpoint. In that configuration, Claude Code is the coding tool and Ling generates the responses. You can keep a separate Claude model configuration for UI work if the client's requirements allow it.

Adding an AntLing key to this project does not change the model powering an existing Codex or Claude session. To use Ling for backend development, explicitly select it in the coding tool or call its API.

[Kilo Code setup](https://developer.ant-ling.com/en/docs/integrations/kilo-code/) · [Claude Code setup](https://developer.ant-ling.com/en/docs/integrations/claude-code/)

## Use Ling inside KnockOn

Using Ling to write backend code is separate from selecting an AI provider for explanations inside the app. The intended explanation flow is: user edits the model, Univer recalculates, the backend sends the relevant assumptions and calculated results to the chosen model, and the UI displays the explanation. The backend must validate proposed edits before applying them. Demand changes and other uncertain relationships remain explicit user assumptions.

For a small connection check after filling in `.env`, run the following from this folder with Node.js 22 or later. It sends a short prompt to AntLing and may consume API credits. It does not send the Univer license files.

```bash
node --env-file=.env --input-type=module <<'JS'
const { ANTLING_API_KEY, ANTLING_BASE_URL, ANTLING_MODEL } = process.env;
if (!ANTLING_API_KEY?.trim() || !ANTLING_MODEL?.trim()) {
  throw new Error('Fill in ANTLING_API_KEY and ANTLING_MODEL in .env first.');
}
const response = await fetch(`${ANTLING_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
  method: 'POST',
  redirect: 'error',
  signal: AbortSignal.timeout(60000),
  headers: {
    Authorization: `Bearer ${ANTLING_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: ANTLING_MODEL,
    messages: [{ role: 'user', content: 'Reply with: KnockOn API connection successful.' }],
    max_tokens: 512,
  }),
});
if (!response.ok) throw new Error(`AntLing returned HTTP ${response.status}. Check key, model access, and quota.`);
const result = await response.json();
const message = result.choices?.[0]?.message?.content;
if (!message) throw new Error('The API returned no text. Inspect the model response settings.');
console.log(message);
JS
```

Ling powers KnockOn's explanations. Calls run in a server route using `process.env.ANTLING_API_KEY`; users' browsers call that route instead of calling AntLing directly.

[AntLing API quickstart](https://developer.ant-ling.com/en/docs/getting-started/quickstart/)
