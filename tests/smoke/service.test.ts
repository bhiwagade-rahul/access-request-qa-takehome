import { api } from '../../src/api-client';
import { assertListEnvelope, assertOrderedIds } from '../../src/assertions';
import { expectedList } from '../../src/test-data';
import { resetService } from '../../src/test-setup';

beforeEach(resetService);
afterAll(resetService);

test('lists the documented default request page', async () => {
  const response = await api.listRequests();
  const expected = expectedList();

  expect(response.kind).toBe('success');
  if (response.kind !== 'success') return;

  assertListEnvelope(response.body, expected);
  assertOrderedIds(response.body.items, expected.items.map(({ requestId }) => requestId));
});
