import { api } from '../../src/api-client';
import { assertDocumentedError, assertRequestShape } from '../../src/assertions';
import { sourceRequests } from '../../src/test-data';
import { resetService } from '../../src/test-setup';

beforeEach(resetService);
afterAll(resetService);

test('gets a known request with its full source-record shape', async () => {
  const expected = sourceRequests[0];
  const response = await api.getRequest(expected.requestId);

  expect(response.kind).toBe('success');
  if (response.kind !== 'success') return;

  assertRequestShape(response.body);
  expect(response.body).toEqual(expected);
});

test('returns the documented not-found contract for an unknown request', async () => {
  const response = await api.getRequest('ar-does-not-exist');

  expect(response.kind).toBe('error');
  assertDocumentedError(response, 404, 'NOT_FOUND');
});
