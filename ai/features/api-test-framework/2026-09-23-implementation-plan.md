# Access Request API Test Framework Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic TypeScript/Jest API test framework for the running access-request service, with reusable typed helpers, layered coverage, local run artifacts, and the required README and defect report.

**Architecture:** Jest tests a service already running at a configurable `BASE_URL` (default `http://localhost:4000`). A typed HTTP client owns requests and JSON parsing; data selectors derive stable test inputs from `service/data/requests.json`; reusable assertions own contract and ordering checks. Jest runs serially because the service has one mutable in-memory dataset, and lifecycle tests reset it before setup.

**Tech Stack:** Node 18+, TypeScript, Jest, ts-jest, native `fetch`, `jest-junit`.

**User constraint:** Do not create Git commits. Do not modify the supplied service bundle or dataset.

---

## Chunk 1: Test Foundation and Reusable API Layer

### Task 1: Initialize TypeScript and Jest configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.cjs`
- Create: `.gitignore`
- Create: `tests/smoke/service.test.ts`

- [ ] **Step 1: Add package scripts and compiler/Jest configuration**

Use `test` for a serial Jest run and `test:watch` for local iteration. Configure `ts-jest`, `testMatch: ['<rootDir>/tests/**/*.test.ts']`, `maxWorkers: 1`, a 10-second test timeout, and JUnit output under `reports/latest/junit.xml`. Ignore `node_modules/`, `coverage/`, and `reports/`.

- [ ] **Step 2: Install only development dependencies**

Run: `npm install --save-dev jest ts-jest typescript @types/jest @types/node jest-junit`

Expected: lockfile and development dependency manifest updated.

- [ ] **Step 3: Add a failing smoke test that imports the future client**

```ts
import { api } from '../../src/api-client';

test('service is reachable', async () => {
  const response = await api.listRequests();
  expect(response.status).toBe(200);
});
```

- [ ] **Step 4: Run it to confirm the missing module failure**

Run: `npm test -- --runInBand tests/smoke/service.test.ts`

Expected: a TypeScript/module resolution failure for `src/api-client`.

- [ ] **Step 5: Do not commit**

The user explicitly requires no commits.

### Task 2: Create typed models and the HTTP client

**Files:**
- Create: `src/types.ts`
- Create: `src/api-client.ts`
- Create: `src/test-setup.ts`
- Create: `src/jest.setup.ts`
- Modify: `jest.config.cjs`
- Test: `tests/smoke/service.test.ts`

- [ ] **Step 1: Define request, response, record, decision, history, and error types**

Model list envelopes, list-query parameters, decision and bulk-decision bodies, and the known API error codes: `NOT_FOUND`, `ALREADY_DECIDED`, `STALE_VERSION`, `JUSTIFICATION_REQUIRED`, and `TOO_MANY_ITEMS`. Keep optional fields optional where the source data may omit them.

- [ ] **Step 2: Implement a minimal client around native `fetch`**

Implement `listRequests`, `getRequest`, `decide`, `bulkDecide`, and `reset`. Read `BASE_URL`, remove any trailing slash, set JSON headers for bodies, parse JSON on all status codes, and return `{ status, body }` rather than throwing for API errors.

- [ ] **Step 3: Add reachability and reset helpers**

`assertServiceReachable()` calls `GET /requests` and produces an error containing the configured URL and start-service command. `resetService()` calls the admin endpoint and requires `{status: 'ok'}`. `src/jest.setup.ts` imports the reachability helper and registers an async `beforeAll` hook; update `jest.config.cjs` to load it through `setupFilesAfterEnv`. Stateful suites register their own `beforeEach(resetService)` hook rather than a global reset.

- [ ] **Step 4: Run the smoke test**

Run: `npm test -- --runInBand tests/smoke/service.test.ts`

Expected: `200` against the running service.

- [ ] **Step 5: Do not commit**

### Task 3: Implement deterministic data selectors and shared assertions

**Files:**
- Create: `src/test-data.ts`
- Create: `src/assertions.ts`
- Test: `tests/unit/test-data.test.ts`
- Test: `tests/unit/assertions.test.ts`

- [ ] **Step 1: Write unit tests for selection and sort helpers**

Cover source-data loading; lexicographic `requestId` tie-breaking; risk/non-risk pending selection; selector diagnostics when no record qualifies, including available status and risk-flag distributions; case-insensitive substring matching; priority rank; and due-date-last ordering in both directions.

- [ ] **Step 2: Run unit tests and confirm they fail before implementation**

Run: `npm test -- --runInBand tests/unit`

Expected: failures because selector/assertion modules are missing.

- [ ] **Step 3: Implement source-data loading and selectors**

Read the dataset relative to project root. Expose `firstPending`, `firstPendingWithRiskFlag`, `firstPendingWithoutRiskFlag`, `firstAlreadyDecided`, `distinctPending`, and expected filtering/sorting/page helpers. Expected-list helpers encode all contract rules: status and type enums, exact `riskFlag` array membership, case-insensitive search across requester/resource/requestId, default page 1, default page size 25, page-size clamp at 100, default requested-at descending sort, all five sort keys, priority ranks, and absent-due-date-last behavior. Every selector must either return the lexicographically smallest matching record or throw an informative diagnostic.

- [ ] **Step 4: Implement contract assertions**

Add helpers for list envelopes, full record shape, API error shape, decision mutation shape, and ordered IDs. Keep assertions purpose-specific rather than hiding test intent.

- [ ] **Step 5: Run unit tests again**

Run: `npm test -- --runInBand tests/unit`

Expected: all unit helper tests pass.

- [ ] **Step 6: Do not commit**

## Chunk 2: Layered API Coverage

### Task 4: Add smoke and functional tests

**Files:**
- Create: `tests/smoke/service.test.ts`
- Create: `tests/functional/requests-list.test.ts`
- Create: `tests/functional/request-detail.test.ts`
- Create: `tests/functional/decision.test.ts`
- Create: `tests/functional/bulk-decision.test.ts`

- [ ] **Step 1: Write tests for default listing and record detail**

Assert the list envelope, defaults, full record fields, and unknown-record exclusion. Derive the expected default page from source data sorted by requested date descending.

- [ ] **Step 2: Write tests for each valid list behavior**

Cover `status`, `type`, `riskFlag`, search, filtered total, page metadata, requested sort keys, both directions, priority rank, and absent due-date ordering. Calculate expected IDs from source data.

- [ ] **Step 3: Write mutation happy-path tests with reset-before-each hooks**

Approve a non-risk pending record with optional justification; deny a pending record with a nonblank justification; assert update/version/decision/history. Test a valid bulk decision and assert its per-item result shape, `SUCCESS` outcomes, and result order matches submitted item order.

- [ ] **Step 4: Run functional tests**

Run: `npm test -- --runInBand tests/smoke tests/functional`

Expected: pass where the service follows the specification; record every reproducible failure without changing assertions to match it.

- [ ] **Step 5: Do not commit**

### Task 5: Add validation, boundary, and lifecycle tests

**Files:**
- Create: `tests/negative-boundary/requests-validation.test.ts`
- Create: `tests/negative-boundary/decision-validation.test.ts`
- Create: `tests/lifecycle/decision-lifecycle.test.ts`
- Create: `tests/lifecycle/bulk-lifecycle.test.ts`

- [ ] **Step 1: Write invalid-list and detail tests**

For every invalid enum/number query value assert `400`; assert page-size clamping above 100; assert an unknown ID has the exact `404 NOT_FOUND` shape.

- [ ] **Step 2: Write invalid-decision tests**

Test malformed/invalid decision bodies, missing or invalid version, whitespace-only denial justification, and risk-flagged approval without nonblank justification. Assert the status and error code required by the specification.

- [ ] **Step 3: Write exact lifecycle sequences**

For stale-version: reset, choose a pending record, send `version + 1`, and verify `STALE_VERSION` plus unchanged state. For already-decided: reset, decide, reread current version, decide again, and verify `ALREADY_DECIDED`. For partial bulk: reset, pre-decide one record and use its updated version together with a distinct pending record at its source version; assert ordered `FAILED/ALREADY_DECIDED` and `SUCCESS` results, then reread both records to verify the pre-decided record remains unchanged and the pending record was decided. Add a separate pending-item bulk stale-version test.

- [ ] **Step 4: Test bulk maximum and malformed input**

Submit 101 syntactically valid item entries and assert `400 TOO_MANY_ITEMS`; submit malformed bodies and assert `400`.

- [ ] **Step 5: Run the complete suite**

Run: `npm test -- --runInBand`

Expected: failures identify candidate defects; passing tests prove supported behavior. Save raw failure evidence for the defect-analysis task.

- [ ] **Step 6: Do not commit**

## Chunk 3: Reporting and Submission Documentation

### Task 6: Persist normalized run results

**Files:**
- Create: `scripts/write-run-report.cjs`
- Modify: `package.json`
- Modify: `jest.config.cjs`
- Test: `tests/unit/run-report.test.ts` or an isolated script fixture

- [ ] **Step 1: Define a failing fixture for normalized report output**

Use a representative Jest JSON result and verify `results.json` includes schema version, timestamp, base URL, summary, named tests, layers, durations, and sanitized failure data; verify `run-metadata.json` handles unavailable Git revisions as `null`.

- [ ] **Step 2: Implement the reporter script**

Set `npm test` to invoke `node scripts/write-run-report.cjs`; the wrapper starts Jest with `--json --outputFile` and `jest-junit`, captures its exit code, writes both `reports/latest/` and `reports/runs/<UTC timestamp>/`, copies JUnit output to both locations, and only then exits with Jest’s original code. This guarantees artifacts exist for failures as well as passes. Do not serialize successful response bodies. Derive each result’s `layer` from the test file path prefix: `tests/smoke/`, `tests/functional/`, `tests/negative-boundary/`, `tests/lifecycle/`, or `tests/unit/`.

`run-metadata.json` must contain the UTC timestamp, effective `BASE_URL`, `process.version`, and Git revision (or `null`). Fixture assertions must verify all four fields, summary counts, layer derivation, and that response-like data attached to a successful test is absent from normalized output.

- [ ] **Step 3: Run one suite and inspect artifacts**

Run: `npm test`

Expected: JUnit, JSON results, and metadata exist in both latest and timestamped directories, even when tests fail.

- [ ] **Step 4: Do not commit**

### Task 7: Write README and evidence-led defect report

**Files:**
- Create: `README.md`
- Create: `DEFECT_REPORT.md`

- [ ] **Step 1: Write the README before finalizing tests**

Document prerequisites; exact two-terminal commands; `BASE_URL`; layering; reset strategy and trade-offs; flakiness policy; report locations; manual/exploratory exclusions; 10-minute mini-regression test names and rationale; and one-day additions. Explicitly note that the service is externally started by design.

- [ ] **Step 2: Analyze only confirmed test failures against the assignment spec**

For each confirmed deviation, record an ID/title, S1–S4 severity rationale, endpoint/repro with actual request/response, specification expectation, root-cause hypothesis, suggested fix, and test name. Put non-mandated observations in a separate spec-gap section.

- [ ] **Step 3: Run final validation**

Run: `npm test`

Run: `npx tsc --noEmit`

Run: `git diff --no-index -- service/access-request-api.js <known-original-copy>` only if an original checksum/copy is available; otherwise verify neither `service/access-request-api.js` nor `service/data/requests.json` is listed in the modified files.

Expected: compilation succeeds; test report accurately records all test outcomes; no supplied service or data content has been changed.

- [ ] **Step 4: Do not commit**

---

## Execution Notes

- Use `@superpowers:test-driven-development` before writing implementation code.
- Use reset-dependent tests serially and reset in each test’s setup.
- Treat test failures as candidate defects, not permission to weaken assertions.
- Do not add optional CI or root-cause deep-dive until the required suite, README, and defect report are complete.
