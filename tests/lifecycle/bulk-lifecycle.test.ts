import { api } from '../../src/api-client';
import { assertDocumentedError } from '../../src/assertions';
import { distinctPending, firstPending } from '../../src/test-data';
import { resetService } from '../../src/test-setup';
import type { BulkDecisionBody } from '../../src/types';

const asBulkBody = (body: unknown): BulkDecisionBody => body as BulkDecisionBody;

describe('bulk-decision lifecycle and validation', () => {
  beforeEach(resetService);
  afterAll(resetService);

  test('reports an already-decided item before a distinct pending success and persists both states', async () => {
    const [preDecided, pending] = distinctPending(2);
    const setup = await api.decide(preDecided.requestId, {
      decision: 'APPROVE', justification: 'Lifecycle setup decision.', version: preDecided.version,
    });
    expect(setup.kind).toBe('success');
    if (setup.kind !== 'success') return;

    const response = await api.bulkDecide({
      items: [
        { requestId: preDecided.requestId, version: setup.body.version },
        { requestId: pending.requestId, version: pending.version },
      ],
      decision: 'DENY',
      justification: 'Duplicate of an existing grant.',
    });

    expect(response.kind).toBe('success');
    if (response.kind !== 'success') return;
    expect(response.body).toEqual({
      results: [
        { requestId: preDecided.requestId, outcome: 'FAILED', reason: 'ALREADY_DECIDED' },
        { requestId: pending.requestId, outcome: 'SUCCESS' },
      ],
    });

    const [persistedPreDecided, persistedPending] = await Promise.all([
      api.getRequest(preDecided.requestId), api.getRequest(pending.requestId),
    ]);
    expect(persistedPreDecided.kind).toBe('success');
    expect(persistedPending.kind).toBe('success');
    if (persistedPreDecided.kind !== 'success' || persistedPending.kind !== 'success') return;
    expect(persistedPreDecided.body).toEqual(setup.body);
    expect(persistedPending.body).toEqual(expect.objectContaining({
      status: 'DENIED', version: pending.version + 1,
      decision: expect.objectContaining({ outcome: 'DENIED' }),
    }));
  });

  test('reports a stale bulk item and leaves it unchanged', async () => {
    const pending = firstPending();
    const response = await api.bulkDecide({
      items: [{ requestId: pending.requestId, version: pending.version + 1 }],
      decision: 'DENY',
      justification: 'Duplicate of an existing grant.',
    });

    expect(response.kind).toBe('success');
    if (response.kind !== 'success') return;
    expect(response.body).toEqual({
      results: [{ requestId: pending.requestId, outcome: 'FAILED', reason: 'STALE_VERSION' }],
    });

    const persisted = await api.getRequest(pending.requestId);
    expect(persisted.kind).toBe('success');
    if (persisted.kind !== 'success') return;
    expect(persisted.body).toEqual(pending);
  });

  test('rejects more than 100 bulk items', async () => {
    const pending = firstPending();
    const response = await api.bulkDecide({
      items: Array.from({ length: 101 }, () => ({ requestId: pending.requestId, version: pending.version })),
      decision: 'DENY',
      justification: 'Duplicate of an existing grant.',
    });

    expect(response.kind).toBe('error');
    assertDocumentedError(response, 400, 'TOO_MANY_ITEMS');
  });

  test.each([
    ['empty object', {}],
    ['items is not an array', { items: {}, decision: 'APPROVE' }],
    ['item is missing version', { items: [{ requestId: firstPending().requestId }], decision: 'APPROVE' }],
    ['unknown decision', { items: [], decision: 'ESCALATE' }],
  ])('rejects malformed bulk body: %s', async (_caseName, body) => {
    const response = await api.bulkDecide(asBulkBody(body));

    expect(response.kind).toBe('error');
    assertDocumentedError(response, 400, 'BAD_REQUEST');
  });
});
