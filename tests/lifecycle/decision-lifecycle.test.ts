import { api } from '../../src/api-client';
import { assertDecisionUpdate, assertDocumentedError } from '../../src/assertions';
import { firstPending } from '../../src/test-data';
import { resetService } from '../../src/test-setup';

describe('single-decision lifecycle', () => {
  beforeEach(resetService);
  afterAll(resetService);

  test('rejects a stale version and leaves the pending record unchanged', async () => {
    const original = firstPending();
    const response = await api.decide(original.requestId, {
      decision: 'DENY', justification: 'Duplicate of an existing grant.', version: original.version + 1,
    });

    expect(response.kind).toBe('error');
    assertDocumentedError(response, 409, 'STALE_VERSION');

    const persisted = await api.getRequest(original.requestId);
    expect(persisted.kind).toBe('success');
    if (persisted.kind !== 'success') return;
    expect(persisted.body).toEqual(original);
  });

  test('uses the current updated version when rejecting an already-decided request', async () => {
    const original = firstPending();
    const firstDecision = await api.decide(original.requestId, {
      decision: 'APPROVE', justification: 'Lifecycle setup decision.', version: original.version,
    });

    expect(firstDecision.kind).toBe('success');
    if (firstDecision.kind !== 'success') return;
    assertDecisionUpdate(firstDecision.body, original, 'APPROVED');

    const secondDecision = await api.decide(original.requestId, {
      decision: 'DENY', justification: 'Must not overwrite the first decision.', version: firstDecision.body.version,
    });
    expect(secondDecision.kind).toBe('error');
    assertDocumentedError(secondDecision, 409, 'ALREADY_DECIDED');

    const persisted = await api.getRequest(original.requestId);
    expect(persisted.kind).toBe('success');
    if (persisted.kind !== 'success') return;
    expect(persisted.body).toEqual(firstDecision.body);
  });
});
