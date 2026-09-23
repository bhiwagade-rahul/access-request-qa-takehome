# Take-Home Project: API Test Framework & Defect Hunt

**Time budget:** 4–6 hours
**Submission:** Link to a private git repository

---

## Background

Your team builds identity governance software. Inside it, employees and service accounts request access — to applications, roles, and entitlements — and administrators triage those requests through an **access request service**: querying the queue, approving or denying with a justification, and recording every decision for audit.

We are preparing a release of this service and you own its quality. The build is in your hands along with its specification. We have planted **8 defects** in it, across a range of severities — some a smoke test would catch, some that only show up in boundary conditions, stateful flows, or concurrency.

**Your job is the job.** Design and build an automated API test framework that would catch this class of defect on any build, run it, and report what you find the way you would report it to the engineering team that owns the service. A precise report of 5 real defects beats 15 vague ones — your score is not the bug count.

---

## What you're given

- `access-request-api.js` — the service, provided as a single bundled file. Run it with Node 18+, no install step:

  ```bash
  PORT=4000 DATA_PATH=./data/requests.json node access-request-api.js
  ```

  Treat it as a **black box**. You may inspect the bundle, but the defects are not meant to be found by reading it — the intended path is testing. Do not modify it; commit it exactly as provided (we verify its checksum).
- `data/requests.json` — the dataset it serves: 45 access requests, deliberately varied and noisy (missing optional fields, long strings, overdue items). The dataset is an input, not a test oracle — derive expectations from the spec.
- The API specification below. It is the **oracle**: where the service deviates from it, that's a defect. Where the specification is silent, use judgment — some things you find may be spec gaps rather than defects, and telling them apart is part of the exercise.

## API specification

All state is in memory; restarting the service (or the reset hook below) restores the dataset exactly. All bodies are JSON. Base path: `/`.

### `GET /requests`

Query parameters (all optional):

| Parameter | Behavior |
|---|---|
| `status` | `PENDING` \| `APPROVED` \| `DENIED` \| `CANCELLED`. Any other value → `400` |
| `type` | `GRANT` \| `REVOKE`. Any other value → `400` |
| `riskFlag` | Exact match against the `riskFlags` array (e.g. `SOD_CONFLICT`) |
| `search` | Case-insensitive substring match on requester name, resource name, or `requestId` |
| `sortBy` | `requestedAt` \| `dueDate` \| `requester` \| `resource` \| `priority`. Anything else → `400`. Priority sorts by rank `LOW < NORMAL < HIGH` |
| `sortDir` | `asc` \| `desc`, anything else → `400`. Default `desc`; default sort is `requestedAt desc` |
| `page` | Positive integer, anything else → `400`. Default 1 |
| `pageSize` | Integer ≥ 1; non-integers or < 1 → `400`. Default 25; values above 100 are clamped to 100 |

Response `200`:

```json
{ "items": [ ... ], "page": 1, "pageSize": 25, "total": 45 }
```

`total` reflects the filtered result set. Sorting by `dueDate` handles records with no due date deterministically (they sort last in both directions).

### `GET /requests/{id}`

- `200` — the full record
- `404` — `{ "error": "NOT_FOUND", "message": "..." }` for unknown ids

### `POST /requests/{id}/decision`

Body:

```json
{ "decision": "APPROVE", "justification": "Reviewed SoD detail; compensating control in place.", "version": 1 }
```

Rules (the server is the source of truth):

- `decision` ∈ `APPROVE` | `DENY`
- Only `PENDING` requests can be decided. Anything else → `409 { "error": "ALREADY_DECIDED" }`
- `version` must match the record's current version. Mismatch → `409 { "error": "STALE_VERSION" }`
- `DENY` requires a non-empty justification (whitespace-only counts as empty). Missing → `422 { "error": "JUSTIFICATION_REQUIRED" }`
- `APPROVE` requires a non-empty justification only when the request carries risk flags; otherwise justification is optional but stored if present
- Malformed body, unknown `decision`, or missing/invalid `version` → `400`

Success `200` returns the updated record: `version` incremented, `decision` populated (`outcome`, `decidedBy`, `decidedAt`, `justification`), and a `DECIDED` event appended to `history`.

### `POST /requests/bulk-decision`

Body:

```json
{ "items": [ { "requestId": "ar-20471", "version": 1 } ], "decision": "DENY", "justification": "Duplicate of an existing grant." }
```

Applies each item independently under the same rules as the single-decision endpoint — **including the version check** — and reports per-item results. Partial success is normal. More than 100 items → `400 { "error": "TOO_MANY_ITEMS" }`; malformed body → `400`.

```json
{ "results": [
  { "requestId": "ar-20471", "outcome": "SUCCESS" },
  { "requestId": "ar-20302", "outcome": "FAILED", "reason": "ALREADY_DECIDED" }
] }
```

### `POST /__admin/reset`

Reloads the dataset from disk and returns `{ "status": "ok" }`. This is a test hook, not product surface — use it (or process restarts) to make your suite deterministic. Don't write tests for the hook itself.

---

## Requirements — the test framework

- **Language:** JavaScript or TypeScript. **Runner:** Jest, Mocha, or Playwright Test (API mode) — your choice. HTTP client of your choice (supertest, axios, got, Playwright's request fixture).
- **Layered coverage**, organized so intent is visible. Suggested layers — rename/restructure as you see fit, and say why in the README:
  - smoke (service up, contract shapes hold)
  - functional, per endpoint
  - negative & boundary (validation, error contract, pagination/sorting edges)
  - stateful lifecycle (decision rules, versioning, bulk partial failure, sequence-dependent behavior)
- **Deterministic.** Every run produces the same results. The service is stateful in memory — how you reset state (reset hook, process lifecycle, or ordering) is your call; explain the choice and its trade-offs in the README.
- **Configurable.** Base URL and port come from configuration/environment, never hardcoded. Test data is read from `data/requests.json` (or asserted against the spec), not copied-and-frozen into fixtures that drift from the real dataset.
- **One command.** `npm test` brings up whatever it needs (service included, if your design starts it), runs the full suite, and tears down. Runs green on a clean checkout with only Node 18+ and npm installed.
- **Built to move.** Your suite may be re-run against a different build of this service whose defects differ. Assertions derived from the spec generalize; assertions derived from today's bugs don't.

### The defect report

A markdown file, one entry per confirmed defect:

- **ID + title** — e.g. `DEF-03: stale version accepted on single decision`
- **Severity** — S1–S4 per the scale below, with one line of reasoning
- **Endpoint(s) + repro** — the exact request(s) and response(s), minimal
- **Expected vs. actual** — cite the spec section
- **Root-cause hypothesis** — what you think is wrong inside the service and why
- **Suggested fix** — one or two lines

Severity scale:

- **S1** — data corruption or loss; a normal user flow records wrong data (audit records are data)
- **S2** — core functionality returns a wrong result or wrong status; no workaround
- **S3** — incorrect behavior with a workaround, or misleading output (counts, metadata)
- **S4** — robustness/polish: invalid input handling, error contract details

Separate section for **spec-gap observations**: behaviors the spec doesn't cover that you'd flag to the spec author rather than file as bugs.

A rough guide, not a contract: framework scaffold ≈ 1h, authoring the suite ≈ 2.5–3h, defect report + README ≈ 1–1.5h.

### Nice-to-haves (optional — pick at most two and do them well)

1. **CI workflow** — a GitHub Actions config for the suite (writing it is enough; running it is not required)
2. **Root-cause deep-dive** — take your most interesting defect beyond a hypothesis: what you'd want from engineering (logs, traces, code) to confirm it, and how you'd verify the fix
3. **AI-assistance appendix** — where you used AI tooling (test generation, scenario mining, failure analysis), what it genuinely helped with, and where it wasted your time or produced wrong tests. Optional and never counted against you

---

## Out of scope

UI/browser testing, load and performance testing, security scanning (though basic input robustness *is* in scope), authentication, modifying or extending the service, testing the `/__admin/reset` hook internals, CI execution.

---

## Deliverables

- The repository: service bundle committed unchanged, dataset, your test framework, defect report
- `README.md` covering:
  - How to run the suite (one command, clean checkout)
  - Test strategy: what each layer covers, what you deliberately left to manual/exploratory testing and why, your flakiness policy
  - **Mini-regression:** if a hotfix build must be validated in 10 minutes and you can run only ~10 of your tests, which do you pick and why?
  - Determinism: how state is reset between runs and the trade-offs of your choice
  - What you would add with one more day
- The defect report as specified above

---

## Evaluation criteria

1. **Framework design** — structure, layering, determinism, maintainability; a teammate could extend it to the next endpoint without archaeology
2. **Coverage strategy** — tests target the rules and boundaries where defects hide (state transitions, validation, versioning, bulk semantics), not URL smearing
3. **Defect recall & precision** — the planted high-severity defects are found; everything reported is real; spec gaps are labeled as spec gaps
4. **Report quality** — reproducible, spec-cited, severity reasoned, RCA plausible
5. **Test quality** — assertions on response bodies and contracts, not just status codes; edge cases, not happy paths
6. **Operational judgment** — determinism approach, flakiness policy, mini-regression selection, README answers

There is no requirement for performance testing, contract-testing tooling, containerization, or CI execution. Keep it focused and solid.
