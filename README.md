<img src="assets/knockon-banner.svg" alt="KnockOn: See what one change sets in motion." width="100%">

# KnockOn

**See what one change sets in motion.**

KnockOn is an interactive economics lab in development. It will help people model a business, introduce a change, and compare possible responses using editable spreadsheets, visible assumptions, and explanations grounded in calculations.

The name comes from a knock-on effect: one change causes consequences elsewhere.

> **Project status:** Early development. The backend is in place: Univer calculates every scenario on the server, projects are saved in Postgres (Neon on Vercel), and Ling 3.2 Flash explains results. The MVP interface is now in place too: a real, editable Univer spreadsheet, scenario forks, comparison tables and charts, result inspection, and Ling explanations for the bakery template. This README will evolve as features are implemented and tested.

## The idea

A user starts with a business template, enters their own figures, or uses a fictional example for learning. A spreadsheet shows the relationships between sales, prices, costs, and profit.

They can then introduce a change, such as higher energy costs, a supplier price increase, or declining sales, and compare the original situation with different responses.

Each response becomes a separate scenario. Users will be able to inspect the inputs and formulas behind the results and explore how different assumptions affect the outcome.

## A bakery example

Imagine a bakery facing higher energy costs. Its owner could explore:

- Keeping bread prices unchanged and accepting a smaller margin.
- Increasing prices and testing different assumptions about customer demand.
- Switching suppliers while accounting for expected savings and additional delivery costs.

The comparison will show the baseline, the effect of the cost increase, and the result of each response. If a price change might affect demand, the user supplies that assumption and can adjust it.

## Who it is for

The first version will focus on small business owners and economics learners. Owners can explore decisions using their own figures; students and teachers can use fictional examples to examine costs, demand, margins, and break-even points.

Templates for freelancers and household budgets may follow later.

## Univer integration

[Univer](https://univer.ai/) will provide the embedded spreadsheet workspace and formula calculation capabilities at the centre of KnockOn.

The integration will connect spreadsheet inputs and calculated results to the app's scenario controls, comparison charts, and explanation panel. KnockOn will add project storage and scenario management around that workspace.

The planned AI assistant will help users set up a model, identify missing inputs, and explain calculated results. Assumptions must remain visible and editable, and explanations must refer back to the relevant inputs and formulas.

[Univer documentation](https://docs.univer.ai/)

## Development workflow

| Tool | Planned role |
| --- | --- |
| Claude | Help build the interface and user interactions. |
| AntLing's Ling 3.2 Flash | Help write the backend, including project storage, scenario management, validation, and APIs. |
| ChatGPT / Codex | Support brainstorming, product planning, specifications, and content preparation. |
| Univer SDK | Provide spreadsheet editing and calculation inside the app. |

These AI development roles describe how the app will be built. The model used for explanations inside the finished app is a separate integration decision.

### Who built what

- **Backend foundation: Ling 3.2 Flash.** Server-side Univer recalculation, the project and scenario API, validation and revision conflicts, the original storage, and the Ling explanation service (commits "Add backend: Univer recalculation, SQLite storage, and project API" and "Add Ling 3.2 Flash explanations").
- **Interface: Claude.** The landing page and Knocky, the projects page, the spreadsheet workspace, scenarios, comparison, inspection, and the Explain panel.
- **Later backend changes: Claude**, building on Ling's foundation: hosted Postgres storage (Neon on Vercel), the Vercel deployment fixes, and the explanation length handling.
- **Inside the app, explanations are written live by Ling 3.2 Flash.**

## First milestone

Complete one bakery workflow from entering figures to saving and reopening scenarios:

- [x] Embed a working Univer spreadsheet with a bakery template.
- [x] Connect editable inputs to sales, cost, and profit formulas.
- [x] Introduce an energy-cost increase while preserving the baseline.
- [x] Create and compare separate response scenarios.
- [x] Save and reopen projects with their inputs, formulas, and assumptions intact.

Subsequent work will add comparison charts, traceable explanations, and more templates.

Comparison charts, formula inspection and Ling explanations are now in the interface. More templates are next.

## Using the interface

Run the app (see [SETUP.md](SETUP.md#run-the-app)) and open http://localhost:3000. The landing page is at `/`: "Meet KnockOn," with Knocky, a halftone domino mascot that gets knocked by a change and sends its effects flying. "Open app" leads to the app itself at `/projects`.

1. **Projects** (`/projects`). Create a project with a name, a currency, and either the fictional demo bakery or blank figures. Saved projects are listed most recently updated first; click one to reopen it.
2. **Workspace.** The bakery model is a real Univer spreadsheet. Edit the eight blue input cells (B2:B9) in the sheet or with the input controls beside it: both change the same workbook cells. Labels and the formulas in B11:B16 are fixed. Metric cards show revenue, total costs, profit, and margin as Univer calculates them; margin shows N/A when revenue is zero, and a loss is labelled as a loss. The Save button is also the save status (Save, Saving…, Saved, Retry save); Ctrl+S saves.
3. **Scenarios.** Save the baseline, then add a shock (energy or fuel cost increase, supplier price increase, or sales decline). The first shock freezes the baseline so every comparison keeps the same starting point. From a shock, add responses: a price change, where you enter the monthly sales you expect at the new price, or a supplier switch with a new ingredient cost and a delivery cost. KnockOn never estimates how customers react to a price.
4. **Compare.** Below the spreadsheet, a table and a chart show the saved, server-calculated results for every scenario, including profit change against the baseline and what changed in each scenario.
5. **Inspect.** Click any result, whether a metric card, a figure in the comparison table, or a result cell in the sheet, to see its formula and the inputs behind it.
6. **Explain.** On a saved scenario, tap ✦ Explain and Ling 3.2 Flash describes why the numbers look the way they do, naming the cells, the inputs that changed, and the assumptions behind them. It explains; it never recalculates or decides for you.

Demo figures are always labelled as fictional. If the project changes elsewhere while you edit (for example in another tab), KnockOn keeps your draft and lets you apply it to the latest version or reload.

## Configuration

For a fresh checkout, copy [`.env.example`](.env.example) to `.env` and fill in the credential fields. If `.env` already exists, edit it directly.

The template includes settings for the Univer license files and AntLing API access, with `Ling-3.2-flash` configured as the model ID. Keep `.env`, API keys, and license files out of version control; the included `.gitignore` excludes them.

Installation and run commands are in [SETUP.md](SETUP.md#run-the-app).

See [SETUP.md](SETUP.md) for configuration details and AntLing coding-tool setup.

## Build documents

- [Shared build brief](docs/BUILD_BRIEF.md): scope, responsibilities, proposed architecture, and acceptance criteria.
- [Model and API contract](docs/API_CONTRACT.md): bakery formulas, expected results, persistence, and interface/backend boundaries.
- [Prompts for Ling and Claude](docs/BUILD_PROMPTS.md): coordinated implementation tasks and handoff requirements.
