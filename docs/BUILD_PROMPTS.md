# Prompts for Ling and Claude

Use both tools against the same repository and the same committed contract. Run Ling's first implementation and handoff before asking Claude to integrate the interface. Subsequent work can use separate Git branches, but coordinate changes to shared schemas, dependencies, and template mappings.

## 1. Give this to Ling 3.2 Flash

```text
You are helping build the backend and technical foundation of KnockOn.

Read README.md, SETUP.md, docs/BUILD_BRIEF.md, and docs/API_CONTRACT.md first. Inspect existing code and local instructions before changing anything. The brief contains proposed starting architecture; use it unless the current repository supplies an established compatible implementation.

Your first task is the Univer integration spike and backend foundation. Work in this repository using Next.js App Router, React, TypeScript, Node.js route handlers, shared Zod contracts, and Prisma/SQLite for a local single-user prototype. Verify supported package versions and commit one lockfile. Keep the user interface minimal because Claude will build the finished interface.

1. Scaffold the project without replacing the existing documentation or environment files. Document required environment variable names without exposing values. Add database files and generated build output to .gitignore.
2. Implement the bakery template and shared contracts exactly as documented. Establish a client/server adapter boundary for Univer. Confirm real browser spreadsheet editing, headless calculation, and snapshot round-trip with formulas intact before expanding the backend. If an SDK API or licensed capability differs from the plan, explain the evidence and update the shared contract; do not simulate a working integration.
3. Implement the documented endpoints, project persistence, scenario forks, baseline freezing, validation, and revision conflict handling. Recalculate submitted snapshots using Univer; do not trust client cached metrics. Keep the calculation schema shared with the UI.
4. Verify the four bakery numerical fixtures, an invalid formula/input save, fork independence, stale-save conflicts, and persistence after a backend restart. These checks should exercise real adapters and storage, not only mocks.
5. Provide a minimal working page that demonstrates the integrated workbook and API. No polished application design, billing, public deployment, collaboration, exports, or extra templates are required.

The Univer spreadsheet is essential. Do not replace it with a hand-built table. Price changes must have an explicit sales-volume assumption. Keep all credentials and server license material out of browser code and logs. Only the browser license content required by Univer may be passed to the editor.

Conclude with the exact run and validation commands, files changed, working endpoints, shared type locations, editor adapter usage, and any unresolved limitations. The next handoff is to Claude for the interface. Do not claim that adding an API key alone proves this work used Ling; verify that the coding tool is configured to use Ling-3.2-flash.
```

## 2. Give this to Claude after Ling's handoff

```text
You are helping build the interface of KnockOn, an interactive economics lab. The tagline is “See what one change sets in motion.”

Read README.md, SETUP.md, docs/BUILD_BRIEF.md, docs/API_CONTRACT.md, and Ling's latest implementation handoff. Inspect the actual shared types, backend endpoints, and Univer adapter before coding.

Build the project list/create flow, scenario workspace, and comparison view defined in the brief. Use the existing React/TypeScript application, real API, and working Univer adapter. Preserve Ling's backend and shared contracts. If you find a mismatch, document it and coordinate the correction rather than inventing a second API or calculation model.

Design a clear workspace for a business owner or economics learner: readable figures, clear scenario names, visibly editable assumptions, a prominent spreadsheet, and an understandable baseline-versus-response comparison. Give negative and positive outcomes text labels as well as colour. Use accessible controls, visible focus states, and clear units/currency.

The workspace needs a scenario list, real Univer editor, linked input controls, metric cards, an inspect-result panel, and an explicit save state. Start with the fictional bakery example. Protect the fixed formula layout while leaving input cells editable. Editing a control and editing its cell must update the same workbook. Show the formula and actual contributing inputs when a user inspects a result.

Cover loading, empty, unsaved, saving, saved, validation-error, network-error, and revision-conflict states. Prevent scenario switching from silently losing a draft. Explain why a frozen baseline is read-only. Ask for expected monthly sales when the price changes; never invent a demand response.

Use a comparison table for the first milestone, drawing from the real calculated metrics. Verify the four fixtures in the shared contract, including a negative-profit edit and a zero-revenue case. Complete create → edit → save → fork → compare → refresh/reopen against the real backend. Keep explanation UI limited to deterministic result inspection until a runtime AI provider is selected and implemented.

Desktop/laptop is the first spreadsheet target. Keep smaller screens usable with accessible navigation and intentional horizontal spreadsheet scrolling. Avoid adding new backend services or changing the stack for styling convenience.

Conclude with the user flows verified, run commands, files changed, any shared-contract issues, and remaining limitations. Do not present mock data or browser-only storage as a completed backend integration.
```

## Handoff record

Each tool's handoff should include:

- Branch and commit identifier.
- Completed scope and changed files.
- Actual dependency versions and any new environment variable names.
- Run and verification commands, with observed results.
- Shared contract changes and their reason.
- Open issues or limitations for the other tool.

No credentials, license contents, or claims of checks that were not run belong in the handoff.
