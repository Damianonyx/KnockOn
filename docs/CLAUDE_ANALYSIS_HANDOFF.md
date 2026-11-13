# KnockOn: break-even and sales sensitivity

Copy this brief to Claude to continue the feature. Verify the repository state before making changes: the implementation status below describes the local work at handoff, not a production release.

## Context and goal

Repository: https://github.com/Damianonyx/KnockOn

App: https://www.knockon.tech

KnockOn is an interactive economics lab for small business owners and economics learners. A user models a bakery in a real Univer spreadsheet, introduces a shock, tries separate responses, and compares the results against a frozen baseline.

Build two connected features in a single **Break-even & sales sensitivity** section below **Compare**. The user wants to document building these features and then publish one standalone X Premium post. Complete and verify the feature before describing it as shipped.

The first feature answers: **How many units must this business sell each month to cover its modelled costs?**

The second answers: **What happens to profit across a sales range the user chooses?**

## Existing rules to preserve

- Univer 1.4.0 is the only calculation engine. Application code may format results and position chart marks, but must not calculate business results independently.
- The saved bakery worksheet is `model`, with eight editable inputs at B2:B9. Labels and formulas are locked.
- B2 is monthly units; B3 is unit price; B4 is ingredient cost per unit. B5:B9 are monthly energy, rent, wages, other expenses and supplier delivery.
- Revenue B11 = B2 × B3. Ingredient costs B12 = B2 × B4. Monthly overheads B13 = SUM(B5:B9). Total costs B14 = B12 + B13. Profit B15 = B11 − B14.
- The first shock freezes the baseline. Analysis must never alter a baseline, scenario, assumption, workbook, chart, saved result or revision.
- Price changes in saved scenarios still require the user's confirmed expected-sales assumption. Exploring hypothetical sales must not substitute for that confirmation.
- Projects are private to a visitor's browser identity. Use existing ownership checks; another visitor must receive 404.
- Ling explains saved scenarios. It never supplies calculated numbers. The first version of these new features does not need a new Ling call or a new AI explanation feature.
- Existing worksheet printing and Excel export operate on the saved scenario workbook. This new analysis is a separate view and is not automatically included in those exports.
- Excel export still needs a separately hosted converter. These two features must work without that converter or new hosting.

## Feature 1: break-even

### Behaviour

Show one selectable result card for every saved scenario, including the baseline. Each card shows the scenario name, the minimum whole units needed to cover costs, and a short explanation. Selecting a card selects that scenario in the sensitivity chart and table.

Use the label **Minimum whole units to cover costs**, not a claim that rounded-up sales produce exactly zero profit. A threshold is not a prediction of achievable demand.

Provide **Inspect break-even** and an expandable **Inspect formulas and inputs** area. Show contribution per unit, monthly overheads, the threshold formula, and the saved inputs that feed them.

### Calculations

Run these formulas in a temporary Univer analysis sheet constructed from validated saved inputs. Preserve the input mappings B2:B9 and existing model formulas. Additional analysis-only cells:

| Cell | Meaning | Formula |
| --- | --- | --- |
| B13 | Monthly overheads | `=SUM(B5:B9)` |
| B18 | Contribution per unit | `=B3-B4` |
| B19 | Minimum whole units to cover costs | `=IF(B18>0,ROUNDUP(B13/B18,0),IF(B13=0,0,""))` |

Explain that these extra cell references belong to the separate analysis, not the saved worksheet.

### Edge cases

- Positive contribution: divide overheads by contribution and round up to a whole unit.
- Positive contribution and zero overheads: zero sales covers costs; positive sales make a profit.
- Zero contribution and positive overheads: no sales volume covers costs.
- Negative contribution and positive overheads: no sales volume covers costs; extra sales increase losses.
- Zero contribution and zero overheads: profit is zero at every volume.
- Negative contribution and zero overheads: break-even occurs only at zero sales; any positive volume loses money.
- Never show infinity, NaN or a negative sales target as a valid threshold. Surface calculation errors explicitly.

### Verification fixtures

These are expected values derived from the existing fictional demo, to verify with the real engine:

- Baseline: price £5, ingredient cost £2, overheads £2,300 → minimum **767 units**.
- Energy raised from £400 to £600: overheads £2,500 → minimum **834 units**.
- Price response £5.50 with the same £2,500 overheads and £2 ingredient cost → minimum **715 units**.
- Supplier response with £1.80 ingredient cost and £100 delivery on the energy-shock scenario: overheads £2,600 → minimum **813 units**.

## Feature 2: sales sensitivity

### Behaviour

The user enters **Minimum monthly sales (units)** and **Maximum monthly sales (units)**, then selects **Run analysis**. Do not silently choose a demand forecast for them.

Accept whole-number endpoints from 0 to 1,000,000,000; maximum must exceed minimum. Explain invalid input without losing the entered range.

Calculate up to eleven evenly spaced whole-number volumes, including both endpoints. For a range smaller than ten units, use every whole-number volume so there are no duplicate samples.

For the selected scenario, show:

- A line chart: monthly units on the horizontal axis, monthly profit on the vertical axis.
- A clearly labelled, dashed baseline comparison when another scenario is selected.
- A zero-profit reference line and visible negative profits.
- A table with the exact sampled units, revenue, total costs and profit.
- Clickable/keyboard-accessible points and profit cells that reveal their formulas and inputs.

Hold the selected scenario's unit price, ingredient cost per unit and monthly overheads fixed as sales vary. Explicitly label the range hypothetical and not a forecast. Do not model a demand response, capacity limit or production-driven energy change.

### Calculations

In the temporary analysis sheet, E2 and E3 hold the chosen range. Sample rows start at row 24:

- Volume: `=ROUND($E$2+($E$3-$E$2)*i/steps,0)`.
- Revenue in B24: `=A24*$B$3`.
- Total costs in C24: `=A24*$B$4+$B$13`.
- Profit in D24: `=B24-C24`.

Apply the corresponding row references for each point. Univer calculates every value. The application renders the returned numbers; a simple SVG chart is sufficient and is consistent with existing comparison charts. Do not describe this application-rendered chart as a new Univer Pro worksheet chart.

Useful demo checks: at 500/1,000/1,500 units, baseline profit is −£800/£700/£2,200; the energy-shock scenario gives −£1,000/£500/£2,000. Verify those figures through Univer.

## Shared architecture and freshness

Suggested/current implementation:

1. `POST /api/projects/:projectId/analysis` accepts `{ expectedRevision, minUnits, maxUnits }`.
2. Use `withVisitor`, `readJson` and the existing private project service.
3. Verify ownership and revision before calculation.
4. Validate each stored bakery workbook and extract its eight inputs. Construct fresh analysis sheets in one temporary workbook; do not copy cached results or chart resources into the calculation.
5. Calculate with a fresh headless Univer instance, wait for calculation completion, read finite results and always dispose the instance.
6. Check the project revision again after calculation to catch concurrent saves. Return 409 if it changed.
7. Return the project ID/revision, chosen range and per-scenario inputs, break-even results and sensitivity points. Use `Cache-Control: no-store`.
8. Perform no database writes. Existing projects must work without a schema migration or baseline rewrite.

In the interface, show the saved revision and range. Unsaved edits must display **Unsaved edits are excluded. Save to include them in the analysis.** Hide previous results when the current saved revision or entered range differs, and ask the user to run analysis again. Keep useful loading, validation, network and conflict states.

## Acceptance checks

- Verify all four fictional scenario thresholds and sampled profits using real Univer calculations.
- Test zero/negative contribution, zero overheads, zero sales and a one-unit range.
- Reject blank, negative, decimal, reversed and oversized ranges.
- Prove analysis leaves frozen baselines, assumptions, charts, saved workbooks and revisions unchanged.
- Reject another visitor and stale revisions. Test a save occurring during analysis.
- Verify old saved workbooks work without extra analysis cells being persisted.
- Exercise the browser flow: enter range → run → choose scenario → inspect a point → save an edit → see stale analysis hidden → rerun.
- Check keyboard access, a phone viewport, long scenario names, and no page-level horizontal overflow.
- Run typecheck, the existing unit/integration suite, a focused browser test and a production build. Do not claim live deployment until the feature branch is merged and the correct deployment has been checked.

## Implementation checkpoint

Local workspace: `/workspace/knockon-license-review`.

Local branch: `codex/break-even-sensitivity`, started from main `16b245217452741646abf3f0973f5e1b1364b4d4`.

The implementation is on feature branch `codex/break-even-sensitivity` in these files:

- `src/lib/contracts/analysis.ts`: range schema, result types and formula definitions.
- `src/server/analysis.ts`: separate Univer analysis workbook, per-scenario results, ownership and revision checks.
- `src/app/api/projects/[projectId]/analysis/route.ts`: private analysis endpoint.
- `src/components/workspace/AnalysisView.tsx` and `.module.css`: combined interface, chart, table and formula inspection.
- `src/lib/api/client.ts`: browser API method.
- `src/components/workspace/Workspace.tsx`: section below Compare.
- `src/lib/univer/server/recalculate.ts`: extracted internal `calculateTrustedWorkbook` engine boundary; existing saves still validate before using it.

The work is being handed off as a draft feature branch, **not merged or deployed to production**. Continue this branch rather than restarting the implementation.

Completed verification:

- The pre-existing root test suite passed after the engine refactor.
- All five new analysis tests passed, including the four demo thresholds, sample profits, zero/negative-contribution cases, short ranges, ownership, stale revisions, a simulated concurrent save, and no changes to the stored project.
- `npm run typecheck` passed.
- The production `npm run build` passed and includes the new API route.
- `git diff --check` passed.

The initial build attempt failed because the execution sandbox blocked a child process; rerunning with the required sandbox permission passed. This was not a TypeScript or app build failure.

**Still to do:**

1. Run the new browser script against a local server: `BASE_URL=http://localhost:3100 CHROMIUM_PATH=/usr/bin/chromium npm run e2e:analysis`. The script is written but has not yet been run. Adjust Chromium's path for your environment.
2. Inspect desktop and phone screenshots, keyboard operation, long labels, formula inspection, range validation and stale-result behaviour. Fix issues found.
3. Add a browser check for unsaved edits being excluded, then save an edited input, verify old results disappear and rerun analysis to verify new results.
4. Review the implementation, especially calculation precision at whole-unit boundaries, very large values, async response freshness, and the shared engine refactor. An earlier test caught Univer returning `-0`; the result reader now normalises it to `0`.
5. Run the relevant existing browser regression checks. Re-run typecheck/tests/build after any fixes. For detailed Node test output use `node --disable-warning=ExperimentalWarning --import tsx --test --test-isolation=none tests/analysis.test.ts`.
6. Finalise API documentation and check the README/docs agree with the final interface. README and in-app docs already have an initial description; `docs/API_CONTRACT.md` still needs the new endpoint documented.
7. Review the feature branch and complete the PR/release workflow. Do not merge or claim the feature is live without the user's release instruction and deployment verification.
8. Prepare the standalone post from the demonstrated feature. Do not publish it automatically.

The new browser test is `scripts/e2e-analysis.mjs`, exposed as `npm run e2e:analysis`. It covers creation, the demo threshold, the energy shock, formula inspection, range validation, ownership/revision failures, keyboard interaction and phone overflow. Screenshots will be written to ignored `verify-results/analysis/` when it is run.

Do not assume this local environment transfers to Claude. Check out the feature branch from GitHub and configure your own ignored local environment. Do not request or commit license files for this analysis: it needs no new credentials. Keep any existing credentials private.

## Continuation review (Claude, 13 November 2026)

Completed on this branch after the checkpoint:

- Ran `npm run e2e:analysis` for the first time: all checks pass. Added checks for unsaved edits being excluded, save-then-rerun producing updated results (834 → 867 units after rent rises to £700), a narrow range sampling every whole unit, and an 80-character scenario name.
- Fixed a precision bug found by probing the real engine: floating-point noise could add a unit at an exact threshold (15 / (4.35 − 4.05) gave 51, not 50). B18 is now `=ROUND(B3-B4,9)` and B19 `=IF(B18>0,ROUNDUP(ROUND(B13/B18,6),0),IF(B13=0,0,""))`. A new test covers five boundary cases and the largest range.
- The chart now marks the selected scenario's threshold when it falls inside the range. The interface states that production capacity and volume-driven energy use are not modelled, and separates the zero- and negative-contribution messages.
- Documented the endpoint in `docs/API_CONTRACT.md`.
- Regression: `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e` and `npm run smoke:api` pass. `npm run e2e:pro` was not run (it needs the Univer licence and export service).

Still open: the owner's release review, merge and deployment check. Not merged, not live.

## Content after verification

One standalone X Premium post should explain the business questions, show the baseline and energy-shock example, demonstrate a user-chosen sales range, and show one formula inspection. State that the range is hypothetical and the baseline stays unchanged. Tag @univerHQ for the calculation engine.

Credit the coding tools that actually contributed. This initial implementation was written by Codex. Ling 3.2 Flash already explains saved scenarios inside KnockOn; do not claim it implemented these new features unless it actually contributes during development. If it does, use the verified Ant Ling handle or `[ANT LING HANDLE]`.

End the post with `knockon.tech`. Do not post it automatically.
