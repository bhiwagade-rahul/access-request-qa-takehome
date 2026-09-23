import type { AccessRequest, DecisionOutcome, KnownErrorCode, ListRequestsResponse } from './types';

export function assertRequestShape(record: unknown): asserts record is AccessRequest {
  expect(record).toEqual(expect.objectContaining({
    requestId: expect.any(String), type: expect.stringMatching(/^(GRANT|REVOKE)$/),
    status: expect.stringMatching(/^(PENDING|APPROVED|DENIED|CANCELLED)$/),
    priority: expect.stringMatching(/^(LOW|NORMAL|HIGH)$/), requestedAt: expect.any(String),
    version: expect.any(Number), history: expect.any(Array),
    requester: expect.objectContaining({ name: expect.any(String) }),
    resource: expect.objectContaining({ name: expect.any(String) }),
  }));
  expect(record).toHaveProperty('decision');
  const candidate = record as AccessRequest;
  for (const historyEvent of candidate.history) {
    expect(historyEvent).toEqual(expect.objectContaining({
      at: expect.any(String), event: expect.any(String), actor: expect.any(String),
    }));
  }
  if (candidate.decision !== null) {
    expect(candidate.decision).toEqual(expect.objectContaining({
      outcome: expect.stringMatching(/^(APPROVED|DENIED)$/), decidedBy: expect.any(String),
      decidedAt: expect.any(String),
    }));
    expect(candidate.decision).toHaveProperty('justification');
  }
}

export function assertListEnvelope(
  body: unknown,
  expected: Pick<ListRequestsResponse, 'page' | 'pageSize' | 'total'>,
): asserts body is ListRequestsResponse {
  expect(body).toEqual(expect.objectContaining({ ...expected, items: expect.any(Array) }));
  for (const record of (body as ListRequestsResponse).items) assertRequestShape(record);
}

export function assertDocumentedError(
  response: { status: unknown; body: unknown }, expectedStatus: 400 | 404 | 409 | 422, expectedError: KnownErrorCode | 'BAD_REQUEST',
): void {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toEqual(expect.objectContaining({ error: expectedError }));
}

export function assertDecisionUpdate(updated: AccessRequest, original: AccessRequest, outcome: DecisionOutcome): void {
  assertRequestShape(updated);
  expect(updated.requestId).toBe(original.requestId);
  expect(updated.status).toBe(outcome);
  expect(updated.version).toBe(original.version + 1);
  expect(updated.decision).toEqual(expect.objectContaining({ outcome }));
  expect(updated.history).toHaveLength(original.history.length + 1);
  expect(updated.history.slice(0, original.history.length)).toEqual(original.history);
  expect(updated.history.at(-1)).toEqual(expect.objectContaining({ event: 'DECIDED', actor: expect.any(String), at: expect.any(String) }));
}

export function assertOrderedIds(records: readonly Pick<AccessRequest, 'requestId'>[], expectedIds: readonly string[]): void {
  expect(records.map(({ requestId }) => requestId)).toEqual(expectedIds);
}
