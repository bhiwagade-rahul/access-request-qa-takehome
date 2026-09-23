import { api } from '../../src/api-client';
import type { AccessRequest, ApiResponse, BulkDecisionResult, Decision } from '../../src/types';
import { resetService } from '../../src/test-setup';

function successfulBody<T>(response: ApiResponse<T>): T {
  if (response.kind !== 'success') {
    throw new Error(`Expected success, received ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

describe('api client', () => {
  beforeEach(async () => {
    await resetService();
  });

  afterAll(async () => {
    await resetService();
  });

  test('serializes list query parameters and preserves the response envelope', async () => {
    const response = await api.listRequests({ status: 'PENDING', page: 1, pageSize: 1 });
    const body = successfulBody(response);

    expect(response.status).toBe(200);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(1);
    expect(body.items).toHaveLength(1);
  });

  test('returns a JSON error body for an unknown request', async () => {
    const response = await api.getRequest('does-not-exist');

    expect(response.status).toBe(404);
    if (response.kind !== 'error') throw new Error('Expected a documented error response');
    expect(response.body).toMatchObject({ error: 'NOT_FOUND' });
    expect(response.body.error).toBe('NOT_FOUND');
  });

  test('models server-valid required nullable decision fields', () => {
    const record: AccessRequest = {
      requestId: 'example',
      type: 'GRANT',
      status: 'PENDING',
      priority: 'LOW',
      requester: { name: 'Example' },
      resource: { name: 'Example resource' },
      requestedAt: '2026-01-01T00:00:00Z',
      version: 1,
      decision: null,
      history: [],
    };

    expect(record.decision).toBeNull();
  });

  test('type contract rejects omitted required nullable fields and permits BAD_REQUEST bulk failures', () => {
    // @ts-expect-error This fixture intentionally omits the required decision field.
    const withoutDecision: AccessRequest = {
      requestId: 'example', type: 'GRANT', status: 'PENDING', priority: 'LOW',
      requester: { name: 'Example' }, resource: { name: 'Example resource' },
      requestedAt: '2026-01-01T00:00:00Z', version: 1, history: [],
    };
    // @ts-expect-error This fixture intentionally omits the required justification field.
    const withoutJustification: Decision = {
      outcome: 'APPROVED', decidedBy: 'Example', decidedAt: '2026-01-01T00:00:00Z',
    };
    const badRequestBulkFailure: BulkDecisionResult = {
      requestId: 'example', outcome: 'FAILED', reason: 'BAD_REQUEST',
    };

    expect([withoutDecision, withoutJustification, badRequestBulkFailure]).toHaveLength(3);
  });

  test('preserves non-JSON diagnostic text from an unexpected HTTP response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Gateway unavailable', {
        status: 503,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    const response = await api.getRequest('example');

    expect(response).toEqual({
      kind: 'unexpected',
      status: 503,
      body: 'Gateway unavailable',
    });
  });

  test('preserves an empty unexpected HTTP response body', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(null, { status: 502 }));

    const response = await api.getRequest('example');

    expect(response).toEqual({ kind: 'unexpected', status: 502, body: null });
  });

  test.each([
    { error: 'UNRECOGNIZED_CODE', message: 'Unknown failure' },
    { error: 'NOT_FOUND', message: 42 },
  ])('classifies malformed API error payloads as unexpected: %j', async (payload) => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(payload), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await api.getRequest('example');

    expect(response).toEqual({ kind: 'unexpected', status: 404, body: payload });
  });

  test('submits a decision body and returns the updated record', async () => {
    const listed = await api.listRequests({ status: 'PENDING', pageSize: 1 });
    const request = successfulBody(listed).items[0];
    expect(request).toBeDefined();
    if (!request) throw new Error('Expected a pending request in the supplied dataset');

    const response = await api.decide(request.requestId, {
      decision: 'APPROVE',
      justification: (request.riskFlags ?? []).length > 0 ? 'Risk reviewed.' : undefined,
      version: request.version,
    });
    const body = successfulBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      requestId: request.requestId,
      status: 'APPROVED',
      version: request.version + 1,
      decision: { outcome: 'APPROVED' },
    });
  });

  test('submits bulk decisions and returns per-item outcomes in submission order', async () => {
    const listed = await api.listRequests({ status: 'PENDING', pageSize: 2 });
    const requests = successfulBody(listed).items;
    expect(requests).toHaveLength(2);

    const response = await api.bulkDecide({
      items: requests.map(({ requestId, version }) => ({ requestId, version })),
      decision: 'DENY',
      justification: 'No longer required.',
    });
    const body = successfulBody(response);

    expect(response.status).toBe(200);
    expect(body.results).toEqual(
      requests.map(({ requestId }) => ({ requestId, outcome: 'SUCCESS' })),
    );
  });
});
