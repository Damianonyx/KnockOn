# KnockOn build brief

Draft v0.1 · November 6, 2026

This is the shared specification for Claude and Ling. Product requirements come from the KnockOn concept brief. The stack and contracts below are proposed starting choices for the first prototype, not claims about existing code. Record implementation changes here and in the [API contract](API_CONTRACT.md) before the other tool depends on them.

## Purpose

**See what one change sets in motion.**

Build an interactive economics lab where someone models a business, introduces a change, and compares possible responses. Users must be able to inspect the assumptions, inputs, and formulas behind each result.

The first audience is small business owners and economics learners. The first complete example is a bakery facing higher energy costs. The initial delivery target is a local, single-user prototype. Public deployment, accounts, and access controls are a later milestone.

## Responsibilities

| Contributor or dependency | Responsibility |
| --- | --- |
| Claude | Interface, accessible interactions, browser-side Univer editor, scenario controls, and comparison views. |
| Ling 3.2 Flash | Initial project scaffold, shared contracts, model templates, Univer calculation adapter, backend routes, persistence, validation, and backend checks. |
| ChatGPT / Codex | Product decisions, brainstorming, briefs, coordinated prompts, and content. |
| Univer SDK | Actual spreadsheet editing and formula calculation. |

Ling must be explicitly selected in the coding tool used for its tasks. A model name in `.env` does not change the model writing code. Choosing an AI provider for explanations inside KnockOn is separate from using Ling for development.

## First complete workflow

1. Create a project, choose a currency, and select the bakery template.
2. Start with clearly labelled fictional demo figures or enter personal figures.
3. Edit the baseline's input cells and inspect revenue, costs, and profit.
4. Save the baseline, then fork an energy-cost shock scenario. Creating the first scenario freezes the saved baseline so comparisons retain a stable starting point.
5. Raise monthly energy cost and save the shock.
6. Fork separate responses from the shock: a price change with an explicit volume assumption, and a supplier change with delivery costs.
7. Compare baseline, shock, and responses in a table, with each scenario's assumptions visible.
8. Save, refresh, and reopen the project. Inputs, formulas, scenarios, and assumptions must survive a backend restart.

For this milestone, changing a frozen baseline requires a new project. A later version can add rebasing or a new baseline version; do not silently alter existing scenarios.

## Screens and states

### Project list

Show saved projects, an empty state, and a create-project action. Creation asks for name, currency, and whether to load fictional demo figures. Do not imply that demo figures are real business data.

### Project workspace

Provide a project header, scenario list, real Univer spreadsheet, input/assumption controls, calculated metric cards, and an inspect-result panel. Show the active scenario and whether changes are unsaved, saving, saved, or failed.

Scenario controls and spreadsheet cells must edit the same underlying workbook. Switching scenarios must preserve a dirty draft or ask the user to save or discard it. The baseline becomes read-only after the first fork; show why and make its formulas inspectable.

### Comparison

Show baseline, shock, and response results side by side, including revenue, total costs, profit, profit margin, and profit change against baseline. Show the scenario's assumptions and currency. A simple table is sufficient for the first milestone; add charts afterwards using those same calculated results.

Include loading, validation, network-error, save-conflict, zero-revenue, and negative-profit states. Desktop and laptop are the first spreadsheet targets; smaller screens must retain accessible navigation and intentional spreadsheet scrolling.

## Calculation rules

- Univer is the calculation engine. Application controls, cards, and charts read its completed calculation results rather than implementing separate arithmetic.
- Use the managed bakery template in the first version: input cells are editable, formula cells and layout are protected. General-purpose row insertion and arbitrary formula editing are later work.
- Maintain stable input and result mappings in the template definition. Show a result's formula and contributing inputs in the inspect panel; general spreadsheet dependency analysis is not required yet.
- Store the full supported Univer workbook snapshot, including formulas. Save/reload must preserve the workbook, not just calculated numbers.
- Validate and recalculate submitted snapshots on the server using the pinned Univer version. Client-supplied cached results are not authoritative. Verify Node/headless compatibility during the first integration spike; report any blocker instead of substituting invented results or a second calculation engine.
- Wait for recalculation to finish before reading results. Formula errors must be shown as errors, not converted to zero. Reject invalid saves while preserving the user's local draft.
- Store precise numeric values; round money only for display. Profit margin is profit divided by revenue, represented as a fraction. When revenue is zero, return `null` and display “N/A”. Negative profit is valid.

## Assumptions

All costs are monthly except ingredient cost per unit. The template models one product, assumes all entered units are sold, and treats energy, rent, wages, other expenses, and delivery as independent monthly inputs. It does not automatically model waste, tax, financing, seasonality, or energy changes caused by production volume. Show these simplifications in the template description.

A price change must never invent a demand response. Ask the user to enter or explicitly confirm expected monthly sales. Demo assumptions must be labelled as demo data. Changing an assumption invalidates any explanation based on the previous workbook revision.

## Proposed implementation defaults

| Area | Starting choice |
| --- | --- |
| Repository | One application in this repository; shared TypeScript contracts. |
| Framework | Next.js App Router with React and TypeScript. |
| Backend | Next.js route handlers using the Node.js runtime. |
| Editor | Univer loaded in the browser; never imported into server rendering code. |
| Calculations | A shared template/adapter boundary, with browser editing and server headless calculation verified against matching package versions. |
| Local persistence | SQLite through Node's built-in `node:sqlite` module for the local prototype (changed from Prisma: no generated client, native build, or engine download); save through server routes. |
| Input validation | Shared Zod schemas and validation repeated on the server. |
| First comparisons | A table and metric cards; charts follow. |

Use supported stable versions verified at scaffolding time, pin all Univer packages compatibly, and commit one package-manager lockfile. SQLite here is for a local process with durable disk. Choose a suitable persistent database and authentication before a hosted multi-user release; this brief does not select a hosting vendor.

Suggested boundaries: `src/app/api/` for backend routes, `src/components/` for interface code, `src/lib/contracts/` for request/response schemas, `src/lib/templates/` for cell mappings, `src/lib/univer/` for snapshot/calculation adapters, and `src/server/` for persistence and services. Shared client/server modules must not import credentials or server-only SDKs.

## Phases

1. **Integration spike:** Ling scaffolds the app and verifies one real Univer workbook in a minimal browser page, matching server calculation, and a snapshot save/reload. Keep the page plain; Claude owns the finished interface.
2. **Backend:** Ling implements the [API contract](API_CONTRACT.md), persistence, scenario forks, validation, and conflict handling. Publish the working schemas and commands for Claude.
3. **Interface:** Claude builds the workspace around the working editor adapter and real API. Temporary fixtures may help isolated UI work, but completed flows must use the backend.
4. **Verification:** Check the full bakery workflow and its numerical fixtures. Fix integration gaps before adding more templates.
5. **Explanations and charts:** Add visual comparisons and, after selecting a runtime provider, an AI explanation service grounded in a specific saved scenario revision. The spreadsheet must remain usable when that service is unavailable.

Exports, real-time collaboration, arbitrary uploaded workbooks, additional business templates, household budgets, billing, and public sharing are outside the first milestone.

## Acceptance criteria

- The editor is Univer, and controls edit its real input cells.
- The [bakery fixtures](API_CONTRACT.md#bakery-template-and-fixtures) match in browser and server calculations.
- Scenario forks do not change their source or the frozen baseline.
- Updating an assumption changes calculations and comparison values consistently.
- A result can be traced to its formula and inputs without an AI response.
- Saves survive refresh and backend restart with formulas intact.
- Invalid edits, formula errors, stale saves, and network failures have usable recovery states.
- Keys and server license material are absent from browser bundles, logs, screenshots, and commits. Pass only the license content required by Univer's browser SDK to that SDK.

Each implementation handoff must state what works, files changed, how to run it, what was verified, and remaining limitations. Do not report a mocked or untested integration as complete.
