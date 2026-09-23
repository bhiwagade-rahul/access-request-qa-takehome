import { api } from '../../src/api-client';
import { assertDocumentedError, assertListEnvelope } from '../../src/assertions';
import { resetService } from '../../src/test-setup';
import type { ListRequestsQuery } from '../../src/types';

describe('GET /requests validation and boundaries', () => {
  beforeEach(resetService);
  afterAll(resetService);

  test.each([
    ['status', 'WAITING'],
    ['type', 'CHANGE'],
    ['sortBy', 'createdAt'],
    ['sortDir', 'up'],
    ['page', 0],
    ['page', 1.5],
    ['pageSize', 0],
    ['pageSize', 1.5],
  ] as const)('rejects invalid %s query value %s', async (field, value) => {
    const response = await api.listRequests({ [field]: value } as ListRequestsQuery);

    expect(response.kind).toBe('error');
    assertDocumentedError(response, 400, 'BAD_REQUEST');
  });

  test('clamps pageSize above 100 to 100', async () => {
    const response = await api.listRequests({ pageSize: 101 });

    expect(response.kind).toBe('success');
    if (response.kind !== 'success') return;
    assertListEnvelope(response.body, { page: 1, pageSize: 100, total: 45 });
  });
});
