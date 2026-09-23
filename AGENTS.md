# Agent Runbook

## Project purpose

This is a TypeScript/Jest API test framework for the supplied access-request service. Treat the specification in `access-request-api-qa-takehome.md` as the oracle. The service and dataset are test inputs, not files to modify.

## Guardrails

- Never modify `service/access-request-api.js` or `service/data/requests.json`.
- Do not initialize Git, commit, push, or change remotes unless the user explicitly asks.
- Do not weaken a specification assertion merely because the current service fails it. A reproducible deviation is candidate defect evidence.
- Keep stateful tests serial. The configured `maxWorkers: 1` is intentional because the running service has one shared in-memory dataset.

## Start the service

In a separate terminal from the project root:

```sh
PORT=4000 DATA_PATH=./service/data/requests.json node service/access-request-api.js
```

The default test target is `http://localhost:4000`. To target a different already-running build, set `BASE_URL`, for example:

```sh
BASE_URL=http://localhost:4100 npm test
```

## Run commands

```sh
npm test                    # Full suite
npm run test:smoke          # Availability and baseline contract
npm run test:functional     # Valid endpoint behavior
npm run test:negative       # Invalid-input and boundary behavior
npm run test:lifecycle      # State transitions and bulk semantics
npm run test:unit           # Pure helpers and reporting renderer
npm run test:regression     # Ten named high-value hotfix checks
npx tsc --noEmit            # TypeScript validation
```

Arguments after `npm test --` are forwarded to Jest:

```sh
npm test -- tests/lifecycle/bulk-lifecycle.test.ts
```

## State and determinism

Decision and bulk-decision requests mutate in-memory records. Stateful suites call `POST /__admin/reset` before each scenario and after the suite. Do not test the reset hook itself. Reset is required so a prior decision does not affect later tests.

## Results and interpretation

Each test command writes artifacts to both `reports/latest/` and `reports/runs/<UTC-timestamp>/`:

```text
index.html          Browser dashboard, grouped by collapsible test layer
results.json        Normalized test results and failed-test evidence
junit.xml           CI-compatible result format
run-metadata.json   Timestamp, BASE_URL, Node version, Git revision
```

Open `reports/latest/index.html` for a browser-friendly summary. A nonzero `npm test` exit means one or more specification tests failed. First determine whether the failure is a framework/environment problem or a confirmed service deviation; documented product defects are intentionally kept as failing tests until the service is fixed.

## Defect reporting

Only document confirmed deviations in `DEFECT_REPORT.md`. Include minimal repro, actual and expected behavior with a specification reference, severity rationale, root-cause hypothesis, and suggested fix. Put unspecified behavior under spec-gap observations instead of filing it as a defect.
