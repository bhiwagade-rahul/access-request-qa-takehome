# Access Request API QA Take-Home

This repository contains a TypeScript/Jest API test suite for the supplied access-request service. The service is deliberately run outside the test runner: it keeps the suite useful against another build without coupling test execution to a particular process manager.

## Run the suite

Prerequisite: Node 18+ and npm. Install dependencies once with `npm ci`.

Use two terminals from the repository root.

Terminal 1 starts the supplied service:

```sh
PORT=4000 DATA_PATH=./service/data/requests.json node service/access-request-api.js
```

Terminal 2 runs the suite:

```sh
npm test
```

The default target is `http://localhost:4000`. To run the same suite against a different running build, set `BASE_URL` (trailing slashes are accepted):

```sh
BASE_URL=http://localhost:4100 npm test
```

Arguments after `npm test --` are forwarded to Jest, for example:

```sh
npm test -- tests/lifecycle/bulk-lifecycle.test.ts
```

For a named test layer or the fast hotfix set, use:

```sh
npm run test:smoke
npm run test:functional
npm run test:negative
npm run test:lifecycle
npm run test:unit
npm run test:regression
```

## Test strategy

The test folders express intent rather than mirror routes:

- `smoke`: reachability and the default list contract; a fast signal that the target is usable.
- `functional`: successful behavior for list, detail, single decision, and bulk decision endpoints.
- `negative-boundary`: invalid query/body contracts and pagination limits.
- `lifecycle`: state transitions, optimistic-version checks, repeated decisions, and bulk partial results.
- `unit`: pure client, assertion, data-selection, and report-normalization behavior; these run without relying on endpoint state.

Test data is read from the supplied JSON input and expected behavior is derived from the specification. It is not copied into test fixtures.

Deliberate exclusions are browser/UI flows, load/performance testing, authentication/authorization, security scanning, and exhaustive compatibility testing across HTTP clients. Those need different tools, environments, or product decisions than this API-focused release check. Exploratory testing would also inspect unusual combinations of filters, malformed JSON transport bodies, Unicode search edge cases, and operator usability of error messages.

### Determinism and flakiness policy

The service is in-memory and mutable. Reset-dependent suites call `POST /__admin/reset` before each scenario and after their suite; Jest is serial (`maxWorkers: 1`) so resets cannot race another mutation. This is slower than parallel execution and requires the test-only reset hook, but it makes every lifecycle scenario self-contained and reproducible against a shared externally running service.

There are no sleeps, retries, or random test inputs. A transient connection error is reported as a failed run with its endpoint evidence; it is not retried into a false green result. A known product defect remains a failing specification assertion until the service is fixed—tests are never weakened to accommodate the current build.

## Run artifacts

Every `npm test` invocation runs Jest with JSON and JUnit reporting. The wrapper preserves Jest's exit code, including test failures, after writing:

```text
reports/latest/junit.xml
reports/latest/results.json
reports/latest/run-metadata.json
reports/latest/index.html
reports/runs/<UTC-timestamp>/junit.xml
reports/runs/<UTC-timestamp>/results.json
reports/runs/<UTC-timestamp>/run-metadata.json
reports/runs/<UTC-timestamp>/index.html
```

`results.json` has a normalized test name, layer, status, duration, and failure evidence only for failed tests—successful response payloads are intentionally omitted. `index.html` is a self-contained browser dashboard grouped into collapsible test layers, with search, status filtering, and expandable failure evidence. Metadata records the UTC timestamp, effective base URL, Node version, and Git revision (or `null` outside a Git checkout).

## 10-minute mini-regression

For a hotfix build, I would run these ten named checks first. They cover availability, list correctness, validation, state safety, and bulk semantics with minimal duplication.

Run them with `npm run test:regression`. One parameterized whitespace-justification check expands into multiple concrete Jest cases while still representing one regression category.

1. `lists the documented default request page` — endpoint availability and baseline envelope.
2. `gets a known request with its full source-record shape` — detail retrieval and record contract.
3. `returns the documented not-found contract for an unknown request` — common negative contract.
4. `filters by exact risk flag SOD_CONFLICT` — high-value filtering path.
5. `reports filtered totals and page metadata` — operator-facing queue count and pagination correctness.
6. `clamps pageSize above 100 to 100` — server-side resource boundary.
7. `rejects invalid sortBy query value createdAt` — query validation rather than silent fallback.
8. `requires a nonblank justification when denying: " \t "` — decision audit-quality guardrail.
9. `rejects a stale version and leaves the pending record unchanged` — optimistic concurrency and data integrity.
10. `reports a stale bulk item and leaves it unchanged` — batch optimistic concurrency, the highest-risk bulk rule.

## With one more day

I would add a small CI job that starts the service and uploads the three artifacts; property-style coverage for filter/sort/pagination combinations; malformed JSON and content-type cases; deterministic contract snapshots for error envelopes; and a parallel-isolation option that gives each worker its own service instance.

See [DEFECT_REPORT.md](DEFECT_REPORT.md) for the confirmed deviations from the specification.
