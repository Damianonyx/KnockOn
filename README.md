<img src="assets/knockon-banner.svg" alt="KnockOn: See what one change sets in motion." width="100%">

# KnockOn

**See what one change sets in motion.**

KnockOn is an interactive economics lab for small business owners and economics learners. Model a business in a real spreadsheet, introduce a change, such as higher energy costs, a supplier price rise or falling sales, and compare possible responses side by side. Every number is calculated by the spreadsheet, every assumption is yours, and an AI explains why the results look the way they do.

The name comes from a knock-on effect: one change causes consequences elsewhere.

**Live:** [knockon.tech](https://www.knockon.tech)

## What you can do

1. **Start a project** at `/projects`. Choose a name, a currency, and either the fictional demo bakery or blank figures. Projects are private to your browser; there are no accounts.
2. **Edit the model.** The bakery model is a real [Univer](https://univer.ai/) spreadsheet. Change the eight blue input cells in the sheet or in the input list beside it. Labels and formulas are locked. Revenue, total costs, profit and margin update as Univer calculates them.
3. **Add a shock:** an energy or fuel cost increase, a supplier price rise, or a sales decline. The first shock freezes the baseline, so every comparison keeps the same starting point.
4. **Add responses** to a shock: change your price (you enter the sales you expect at the new price; KnockOn never guesses how customers react), or switch supplier with a new ingredient cost and delivery cost.
5. **Compare** every scenario in one table and one chart, with profit change against the baseline and what changed in each scenario.
6. **Inspect** any result, whether a metric card, a figure in the comparison, or a cell in the sheet, to see its formula and the inputs behind it.
7. **Explain.** Tap ✦ Explain on a saved scenario and Ling 3.2 Flash describes why the numbers look the way they do, naming the cells, the inputs that changed and the assumptions behind them. It explains; it never recalculates or decides for you.

Demo figures are always labelled as fictional. If a project changes elsewhere while you edit, KnockOn keeps your draft and lets you apply it to the latest version or reload. The Save button doubles as the save status, and Ctrl+S saves.

Knocky, the halftone domino mascot, greets you on the landing page and in your projects, knocks when you add a shock, cheers you on when you plan a response, and looks surprised when something goes wrong.

## Design principles

- **One right default instead of ten knobs.** No settings pages, filter bars or mode switches.
- **Remove parts until the right action is the only obvious one.** Each screen has one next step.
- **Works on a phone.** Every screen is laid out for narrow screens. On a phone, the comparison table becomes one card per scenario, and the chart and spreadsheet fit the screen.

## How it works

| Part | What it does |
| --- | --- |
| **Univer** | The only calculation engine: the editable spreadsheet in the browser and the same formulas recalculated on the server for every save. Nothing is computed outside it. |
| **Postgres** | Stores projects and scenarios (Neon on Vercel; embedded PGlite for local runs and tests). Saves use revision checks, so two edits can never silently overwrite each other. |
| **Ling 3.2 Flash** | Writes explanations from the saved figures, formulas and assumptions. It only explains. |
| **Next.js** | App Router with React and TypeScript, deployed on Vercel. |

### Privacy and limits

Each browser gets a random private ID in an HttpOnly cookie, and projects are stored with a hash of it, so visitors only ever see their own projects. Explain is limited per visitor, per network and site-wide to keep the AI bill bounded. Details and settings: [SETUP.md](SETUP.md#privacy-and-limits).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Without a database URL, the app stores data in an embedded Postgres in `./data/pglite`. Copy [`.env.example`](.env.example) to `.env` to add the Univer license and the AntLing API key. Keep `.env`, keys and license files out of version control; `.gitignore` already excludes them.

| Command | What it checks |
| --- | --- |
| `npm test` | Calculations, storage, scenarios, privacy, rate limits and explanations |
| `npm run typecheck` | TypeScript |
| `npm run smoke:api` | The HTTP API against a running server |
| `npm run e2e` | The whole interface in a real browser, including a phone layout |

Full configuration and the Vercel deployment steps are in [SETUP.md](SETUP.md).

## Build documents

- [Shared build brief](docs/BUILD_BRIEF.md): scope, responsibilities, architecture and acceptance criteria.
- [Model and API contract](docs/API_CONTRACT.md): bakery formulas, expected results, persistence, and interface/backend boundaries.
- [Prompts for Ling and Claude](docs/BUILD_PROMPTS.md): the coordinated implementation tasks.
