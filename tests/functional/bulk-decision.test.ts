import { api } from '../../src/api-client';
import { distinctPending } from '../../src/test-data';
import { resetService } from '../../src/test-setup';

describe('POST /requests/bulk-decision valid decisions', () => {
  beforeEach(resetService);
  afterAll(resetService);

  test('decides each pending item and preserves submitted result order', async () => {
    const requests = distinctPending();
    const response = await api.bulkDecide({
      items: requests.map(({ requestId, version }) => ({ requestId, version })),
      decision: 'DENY',
      justification: 'Duplicate of an existing grant.',
    });

    expect(response.kind).toBe('success');
    if (response.kind !== 'success') return;
    expect(response.body).toEqual({
      results: requests.map(({ requestId }) => ({ requestId, outcome: 'SUCCESS' })),
    });
  });
});
