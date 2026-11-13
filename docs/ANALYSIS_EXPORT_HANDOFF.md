# Analysis PDF and Excel exports — WIP handoff

Continue branch `codex/analysis-exports`. Its base is main commit `826bf502cb2c7e4fe665564071a411f0746add65` (merged PR #8). This checkpoint contains the report-export implementation; it is not production-ready and has not been merged. The earlier `CLAUDE_ANALYSIS_HANDOFF.md` describes the already-merged analysis feature, not the remaining work here.

## Implemented

- `AnalysisExportTools.tsx` adds **Print analysis / PDF** and **Export analysis Excel** to current analysis results. The selected scenario, saved revision and range are captured for each report. Changing them removes stale controls and prevents an obsolete Excel response from starting a download.
- `src/server/analysis-report.ts` builds a temporary report from validated saved inputs, recalculates it with Univer, and adds a real Univer line chart. The report includes all scenario thresholds, selected sensitivity results, baseline comparison, source inputs, recorded assumptions, model limits, currency and revision. Supporting worksheets retain inspectable formulas.
- Private POST endpoints live at `/api/projects/:projectId/analysis/report` and `/analysis/export`. Both accept `{ expectedRevision, scenarioId, minUnits, maxUnits }`. Ownership, range and revision checks run before work; freshness is checked again after calculation and conversion. Nothing is persisted to the project.
- `/projects/:projectId/analysis/print` loads a separate read-only Univer instance. Its own print preview defaults to landscape and fit-to-width, leaving the project tab's unsaved draft alone.
- `calculateProjectAnalysisWorkbook` exposes the calculated source workbook; `calculateTrustedWorkbook` supports an internal post-calculation callback to insert the report chart.
- The private converter accepts multiple worksheets. Existing deployed converter versions must be updated; old versions reject report workbooks.
- README, setup guidance, in-app docs and API contract describe the new controls and endpoints.

## Verification already performed

- `npm test`: **59 tests passed**, including the new report tests and existing chart persistence/save tests.
- Converter `npm test`: **4 tests passed**.
- TypeScript and production build passed during implementation. Later edits include documentation and the browser-test capture changes described below; rerun checks for the final tree.
- A real licensed Excel download passed through the browser, app API and local private converter. Its ZIP/XML was inspected independently:
  - Worksheets: `Analysis report`, `analysis_0`, `analysis_1`.
  - One embedded chart, with two profit series referencing the report cells.
  - Report formulas referring to source B19 retained cached thresholds **767** and **834**.
  - Report formulas referring to source D29 retained cached profits **700** and **500** at 1,000 units.
  - Source formulas were retained; printing/exporting left the stored project unchanged.
- Univer's report print preview opens, and NEXT reaches the native `window.print` boundary.

These are local verification results, not a claim about production. Source tests are committed; private browser state, generated reports, logs, licenses and environment files are not.

## Unfinished browser/PDF checks — start here

Run a local app with suitable configuration, then:

```bash
BASE_URL=http://localhost:3100 CHROMIUM_PATH=/usr/bin/chromium npm run e2e:analysis-export
```

Adjust Chromium's path for the environment. The local development machine used `npm start -- --port 3100` after a production build, with an isolated PGlite database and the licensed converter at port 3200.

The last completed browser run stopped when reopening **Print / PDF** after the first print: a Univer loading toast/preview canvas intercepted the click. Inspect preview teardown, cancellation and mobile resizing. Do not merely force the click and call the user interaction fixed.

Two browser-test corrections are already in the working checkpoint but have **not been rerun**:

1. Next's empty route announcer has `role=alert`. The test now checks the report's visible error paragraphs instead; the initial alert assertion was a test false positive.
2. Serialising `outerHTML` loses canvas pixels, so the first diagnostic PDF contained blank pages even though native printing had been invoked. The capture now replaces canvases with image snapshots in a detached DOM copy, waits for images and rejects tiny placeholder PDFs. It also cancels an existing preview before attempting the mobile reopen.

Inspect the new actual PDF pages, not just its file signature. An early preview screenshot showed an empty chart region; whether that was render timing was not diagnosed. Verify the chart is visibly rendered in the preview and exported PDF. Review table pagination and long notes. The current paragraph splitter can break words at character boundaries; improve it if it harms readability.

Artifacts will be written to ignored `verify-results/analysis-export/`. That directory from the previous machine does not transfer with this branch.

Also verify:

- A phone viewport, keyboard access, print cancellation/reopening, and error recovery.
- The selected scenario and range match the output; modified/unsaved drafts stay unchanged and are excluded.
- Another visitor gets 404 and stale revisions get 409 for both endpoints.
- Special break-even cases remain correctly labelled in both report and Excel.
- Existing worksheet printing/charts/export still work after the shared adapter changes. Run relevant existing regression scripts and repeat tests/typecheck/build after fixes.

## License and hosting boundaries

No credentials are committed. The browser print preview uses **Univer Pro sheets-print**; do not equate unlicensed/trial behaviour with a fully verified licensed PDF flow. Without a license, verify what the environment permits and state the remaining limitation explicitly.

Excel needs the existing private converter, `UNIVER_EXPORT_URL` and `UNIVER_EXPORT_TOKEN`, plus the converter's license settings and persistent SDK state volume. Production Vercel had neither export variable when last inspected. This branch does not provision hosting or enable production Excel downloads.

For local verification, the existing converter container's `server.mjs` was updated and the container restarted with its license-state volume retained. A real deployment should rebuild/redeploy the service normally, e.g. `docker compose up -d --build`. Never delete the persistent volume to reset usage.

## Finish

Review and fix the remaining issues, record exactly which checks were possible, then open a PR against main. Keep it WIP until the browser/PDF checks pass. Do not merge, publish a post or claim the additions are live without the owner's release instruction and deployment verification.
