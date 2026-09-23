import { api } from '../../src/api-client';
import { assertDocumentedError } from '../../src/assertions';
import { firstPending, firstPendingWithRiskFlag } from '../../src/test-data';
import { resetService } from '../../src/test-setup';
import type { DecisionBody } from '../../src/types';

const asDecisionBody = (body: unknown): DecisionBody => body as DecisionBody;

describe('POST /requests/{id}/decision validation', () => {
  beforeEach(resetService);
  afterAll(resetService);

  test.each([
    ['empty object', {}],
    ['unknown decision', { decision: 'ESCALATE', version: 1 }],
    ['missing version', { decision: 'APPROVE' }],
    ['zero version', { decision: 'APPROVE', version: 0 }],
    ['non-integer version', { decision: 'APPROVE', version: 1.5 }],
    ['string version', { decision: 'APPROVE', version: '1' }],
  ])('rejects malformed body: %s', async (_caseName, body) => {
    const pending = firstPending();
    const response = await api.decide(pending.requestId, asDecisionBody(body));

    expect(response.kind).toBe('error');
    assertDocumentedError(response, 400, 'BAD_REQUEST');
  });

  test.each([undefined, '', ' \t '])('requires a nonblank justification when denying: %p', async (justification) => {
    const pending = firstPending();
    const response = await api.decide(pending.requestId, asDecisionBody({
      decision: 'DENY', version: pending.version, justification,
    }));

    expect(response.kind).toBe('error');
    assertDocumentedError(response, 422, 'JUSTIFICATION_REQUIRED');
  });

  test.each([undefined, '', ' \n '])('requires a nonblank justification for risk approval: %p', async (justification) => {
    const pending = firstPendingWithRiskFlag();
    const response = await api.decide(pending.requestId, asDecisionBody({
      decision: 'APPROVE', version: pending.version, justification,
    }));

    expect(response.kind).toBe('error');
    assertDocumentedError(response, 422, 'JUSTIFICATION_REQUIRED');
  });
});
