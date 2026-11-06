<img src="assets/knock-on-icon.svg" alt="Knock-On icon" width="160">

# Knock-On

**See what one change sets in motion.**

Knock-On is an interactive economics lab in development. It will help people model a business, introduce a change, and compare possible responses using editable spreadsheets, visible assumptions, and explanations grounded in calculations.

The name comes from a knock-on effect: one change causes consequences elsewhere.

> **Project status:** Early development. This repository currently contains documentation and environment configuration. The app and Univer integration are planned. This README will evolve as features are implemented and tested. Knock-On is a working name.

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

[Univer](https://univer.ai/) will provide the embedded spreadsheet workspace and formula calculation capabilities at the centre of Knock-On.

The integration will connect spreadsheet inputs and calculated results to the app's scenario controls, comparison charts, and explanation panel. Knock-On will add project storage and scenario management around that workspace.

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

## First milestone

Complete one bakery workflow from entering figures to saving and reopening scenarios:

- [ ] Embed a working Univer spreadsheet with a bakery template.
- [ ] Connect editable inputs to sales, cost, and profit formulas.
- [ ] Introduce an energy-cost increase while preserving the baseline.
- [ ] Create and compare separate response scenarios.
- [ ] Save and reopen projects with their inputs, formulas, and assumptions intact.

Subsequent work will add comparison charts, traceable explanations, and more templates.

## Configuration

For a fresh checkout, copy [`.env.example`](.env.example) to `.env` and fill in the credential fields. If `.env` already exists, edit it directly.

The template includes settings for the Univer license files and AntLing API access, with `Ling-3.2-flash` configured as the model ID. Keep `.env`, API keys, and license files out of version control; the included `.gitignore` excludes them.

Application installation and run commands will be added once the app is scaffolded. Environment configuration alone does not activate the SDK or verify API access.

See [SETUP.md](SETUP.md) for configuration details and AntLing coding-tool setup.

## Build documents

- [Shared build brief](docs/BUILD_BRIEF.md): scope, responsibilities, proposed architecture, and acceptance criteria.
- [Model and API contract](docs/API_CONTRACT.md): bakery formulas, expected results, persistence, and interface/backend boundaries.
- [Prompts for Ling and Claude](docs/BUILD_PROMPTS.md): coordinated implementation tasks and handoff requirements.
