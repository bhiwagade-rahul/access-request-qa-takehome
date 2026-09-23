import {
  assertDecisionUpdate,
  assertDocumentedError,
  assertListEnvelope,
  assertOrderedIds,
  assertRequestShape,
} from '../../src/assertions';
import type { AccessRequest } from '../../src/types';

const record: AccessRequest = {
  requestId: 'ar-1', type: 'GRANT', status: 'PENDING', priority: 'LOW',
  requester: { name: 'Ada' }, resource: { name: 'Payroll' }, requestedAt: '2026-01-01T00:00:00Z',
  version: 1, decision: null, history: [{ at: '2026-01-01T00:00:00Z', event: 'REQUESTED', actor: 'Ada' }],
};

describe('contract assertions', () => {
  test('validates list envelope metadata and each record shape', () => {
    expect(() => assertListEnvelope({ items: [record], page: 1, pageSize: 25, total: 1 }, { page: 1, pageSize: 25, total: 1 })).not.toThrow();
  });

  test('rejects an incomplete record shape', () => {
    expect(() => assertRequestShape({ requestId: 'ar-1' })).toThrow();
  });

  test('rejects a malformed history entry', () => {
    expect(() => assertRequestShape({ ...record, history: [{ event: 'REQUESTED', actor: 'Ada' }] })).toThrow();
  });

  test('checks documented error status and code', () => {
    expect(() => assertDocumentedError({ status: 404, body: { error: 'NOT_FOUND', message: 'Missing' } }, 404, 'NOT_FOUND')).not.toThrow();
    expect(() => assertDocumentedError({ status: 200, body: { error: 'NOT_FOUND' } }, 404, 'NOT_FOUND')).toThrow();
  });

  test('checks decision version, outcome, and appended decision history', () => {
    const updated: AccessRequest = {
      ...record, status: 'APPROVED', version: 2,
      decision: { outcome: 'APPROVED', decidedBy: 'Reviewer', decidedAt: '2026-01-02T00:00:00Z', justification: null },
      history: [...record.history, { at: '2026-01-02T00:00:00Z', event: 'DECIDED', actor: 'Reviewer' }],
    };

    expect(() => assertDecisionUpdate(updated, record, 'APPROVED')).not.toThrow();
  });

  test('rejects a decision update that changes the original history prefix', () => {
    const corrupted: AccessRequest = {
      ...record, status: 'APPROVED', version: 2,
      decision: { outcome: 'APPROVED', decidedBy: 'Reviewer', decidedAt: '2026-01-02T00:00:00Z', justification: null },
      history: [
        { at: '2026-01-01T00:00:00Z', event: 'TAMPERED', actor: 'Ada' },
        { at: '2026-01-02T00:00:00Z', event: 'DECIDED', actor: 'Reviewer' },
      ],
    };

    expect(() => assertDecisionUpdate(corrupted, record, 'APPROVED')).toThrow();
  });

  test('compares IDs in their required order', () => {
    expect(() => assertOrderedIds([record], ['ar-1'])).not.toThrow();
    expect(() => assertOrderedIds([record], ['ar-2'])).toThrow();
  });
});
