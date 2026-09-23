import { api } from '../../src/api-client';
import { assertDecisionUpdate } from '../../src/assertions';
import { firstPending, firstPendingWithoutRiskFlag } from '../../src/test-data';
import { resetService } from '../../src/test-setup';

describe('POST /requests/{id}/decision valid decisions', () => {
  beforeEach(resetService);
  afterAll(resetService);

  test('approves a non-risk pending request without a justification', async () => {
    const original = firstPendingWithoutRiskFlag();
    const response = await api.decide(original.requestId, {
      decision: 'APPROVE',
      version: original.version,
    });

    expect(response.kind).toBe('success');
    if (response.kind !== 'success') return;
    assertDecisionUpdate(response.body, original, 'APPROVED');
    expect(response.body.decision?.justification).toBeNull();
  });

  test('denies a pending request with a nonblank justification', async () => {
    const original = firstPending();
    const justification = 'Duplicate of an existing grant.';
    const response = await api.decide(original.requestId, {
      decision: 'DENY',
      justification,
      version: original.version,
    });

    expect(response.kind).toBe('success');
    if (response.kind !== 'success') return;
    assertDecisionUpdate(response.body, original, 'DENIED');
    expect(response.body.decision?.justification).toBe(justification);
  });
});
