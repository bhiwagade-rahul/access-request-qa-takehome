# Confirmed Defects

Evidence below was captured against the externally running service after `POST /__admin/reset`. Request/response examples are intentionally minimized; the failing named tests in `reports/latest/results.json` retain diagnostic evidence.

## DEF-01: Filtered list reports the unfiltered total

**Severity: S3.** Queue counts and pagination metadata mislead an operator, although individual records can still be retrieved.

**Endpoint and repro.** `GET /requests?status=PENDING&page=2&pageSize=3` returned `200` with `{ "page": 2, "pageSize": 3, "total": 45, "itemIds": ["ar-20666","ar-20660","ar-20518"] }`. The supplied data contains 20 pending records.

**Expected vs. actual.** The `GET /requests` specification says `total` reflects the filtered result set; expected `total: 20`, actual `total: 45`. This is exercised by `GET /requests valid filters > reports filtered totals and page metadata`.

**Root-cause hypothesis.** The response envelope appears to be built from the original collection rather than the filtered collection.

**Suggested fix.** Compute `total` after applying all accepted filters and paginate that filtered, sorted collection.

## DEF-02: `riskFlag` filter is ignored

**Severity: S3.** Risk triage cannot narrow the queue to the requested control condition; users have a manual workaround but it is error-prone.

**Endpoint and repro.** `GET /requests?riskFlag=SOD_CONFLICT&pageSize=100` returned `200` with `{ "total": 45, "itemCount": 45 }`, including records without `SOD_CONFLICT`. The input data has four matching request IDs: `ar-20452`, `ar-20518`, `ar-20570`, and `ar-20660`.

**Expected vs. actual.** The list specification requires an exact match against the `riskFlags` array. Expected four matching records; actual result contained all 45. Confirmed by `GET /requests valid filters > filters by exact risk flag SOD_CONFLICT`.

**Root-cause hypothesis.** The query parsing/filter predicate does not apply `riskFlag` to `record.riskFlags`.

**Suggested fix.** Add an exact array-membership predicate before sorting and pagination, and keep it composed with the other filters.

## DEF-03: Invalid sort options are accepted

**Severity: S4.** Invalid input silently produces a list that can be mistaken for a valid sort.

**Endpoint and repro.** `GET /requests?sortBy=createdAt&pageSize=1` returned `200 { "page": 1, "pageSize": 1, "total": 45, "itemIds": ["ar-20120"] }`. `GET /requests?sortDir=up&pageSize=1` also returned `200 { "page": 1, "pageSize": 1, "total": 45, "itemIds": ["ar-20680"] }`.

**Expected vs. actual.** The list specification requires `400` for any unsupported `sortBy` or `sortDir`. Actual status is `200`. Confirmed by `rejects invalid sortBy query value createdAt` and `rejects invalid sortDir query value up`.

**Root-cause hypothesis.** Sort values are used as fallback/default choices without an allow-list validation step.

**Suggested fix.** Validate both parameters against their documented enumerations before building the response; return `400 { "error": "BAD_REQUEST" }` on failure.

## DEF-04: `pageSize` above 100 is not clamped

**Severity: S4.** The documented server-side boundary can be bypassed, risking unexpectedly large list responses.

**Endpoint and repro.** `GET /requests?pageSize=101` returned `200 { "page": 1, "pageSize": 101, "total": 45, "itemCount": 45 }`.

**Expected vs. actual.** The list specification requires values above 100 to be clamped to 100. Actual `pageSize` is 101. Confirmed by `clamps pageSize above 100 to 100`.

**Root-cause hypothesis.** Numeric validation checks the lower bound but does not cap the parsed value.

**Suggested fix.** Set effective page size to `Math.min(parsedPageSize, 100)` before slicing and echo that effective value.

## DEF-05: Whitespace-only denial justification is accepted

**Severity: S2.** A normal denial flow can create an audit decision with no meaningful justification and no server-side workaround.

**Endpoint and repro.** After reset, `POST /requests/ar-20471/decision` with `{ "decision": "DENY", "justification": "   ", "version": 1 }` returned `200 { "requestId": "ar-20471", "status": "DENIED", "version": 2, "decision": { "outcome": "DENIED", "justification": "" } }`.

**Expected vs. actual.** The decision specification says DENY requires a non-empty justification and whitespace-only counts as empty; expected `422 { "error": "JUSTIFICATION_REQUIRED" }`, actual success. Confirmed by `requires a nonblank justification when denying: " \t "`.

**Root-cause hypothesis.** Validation tests truthiness or performs trim only when storing, not when deciding whether the value is present.

**Suggested fix.** Validate `typeof justification === 'string' && justification.trim().length > 0` before changing state for denial and risk-flagged approval.

## DEF-06: A request can be decided more than once

**Severity: S1.** A normal decision request overwrites a prior audit decision and appends another decision event, corrupting the audit history.

**Endpoint and repro.** After reset, approving `ar-20471` with version 1 succeeded. A second request, `POST /requests/ar-20471/decision` with `{ "decision": "DENY", "justification": "second", "version": 2 }`, returned `200 { "requestId": "ar-20471", "status": "DENIED", "version": 3, "decision": { "outcome": "DENIED", "justification": "second" }, "historyLength": 3 }`.

**Expected vs. actual.** Only pending requests may be decided; anything else must return `409 { "error": "ALREADY_DECIDED" }`. Actual response overwrote the approval. Confirmed by `uses the current updated version when rejecting an already-decided request`.

**Root-cause hypothesis.** The handler checks the version but does not guard the current `status === 'PENDING'` before mutation.

**Suggested fix.** Reject non-pending records before any version/update work and preserve the existing record unchanged.

## DEF-07: Bulk decision ignores a stale item version

**Severity: S1.** A batch operation can mutate a request despite a stale client version, defeating optimistic concurrency and risking incorrect audit decisions.

**Endpoint and repro.** After reset, `POST /requests/bulk-decision` with `{ "items": [{ "requestId": "ar-20471", "version": 2 }], "decision": "DENY", "justification": "Duplicate" }` returned `200 { "results": [{ "requestId": "ar-20471", "outcome": "SUCCESS" }] }`; the source version is 1.

**Expected vs. actual.** Bulk applies the single-decision rules, explicitly including the version check. Expected `{ "results": [{ "requestId": "ar-20471", "outcome": "FAILED", "reason": "STALE_VERSION" }] }` with no mutation; actual reports success. Confirmed by `reports a stale bulk item and leaves it unchanged`.

**Root-cause hypothesis.** The bulk branch validates item shape but does not compare item version to the current record version.

**Suggested fix.** Reuse the single-decision version check for each item and return a per-item `STALE_VERSION` failure without changing that record.

## DEF-08: Bulk body with a missing item version returns a success envelope

**Severity: S4.** A malformed bulk request does not receive the documented request-level validation status, which complicates clients' error handling.

**Endpoint and repro.** After reset, `POST /requests/bulk-decision` with `{ "items": [{ "requestId": "ar-20471" }], "decision": "DENY", "justification": "Duplicate" }` returned `200 { "results": [{ "requestId": "ar-20471", "outcome": "FAILED", "reason": "BAD_REQUEST" }] }`.

**Expected vs. actual.** The bulk specification says malformed body returns `400`; an item without required `version` is malformed under the same decision validation rules. Actual status is `200`. Confirmed by `rejects malformed bulk body: item is missing version`.

**Root-cause hypothesis.** Top-level bulk validation permits incomplete items and defers their validation into the per-item execution path.

**Suggested fix.** Validate required item fields and version type before processing the batch; reject malformed bodies with `400 { "error": "BAD_REQUEST" }`.

# Spec-gap observations

These are questions for the specification author, not confirmed defects.

- The list contract does not define behavior for a `page` beyond the final page (empty `200` versus an error).
- Bulk decision does not define the per-item result for an unknown `requestId`.
- The API is unauthenticated in this exercise, but the source and required semantics of `decision.decidedBy` are not specified for a production interface.
