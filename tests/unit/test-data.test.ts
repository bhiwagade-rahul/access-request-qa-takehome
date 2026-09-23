import type { AccessRequest } from '../../src/types';
import {
  distinctPending,
  expectedList,
  firstAlreadyDecided,
  firstPending,
  firstPendingWithRiskFlag,
  firstPendingWithoutRiskFlag,
  loadSourceRequests,
  priorityRank,
  sortRequests,
} from '../../src/test-data';

const request = (overrides: Partial<AccessRequest>): AccessRequest => ({
  requestId: 'ar-1', type: 'GRANT', status: 'PENDING', priority: 'NORMAL',
  requester: { name: 'Alex Example' }, resource: { name: 'Ledger' },
  requestedAt: '2026-01-01T00:00:00Z', version: 1, decision: null, history: [],
  ...overrides,
});

describe('test data selectors', () => {
  test('loads the supplied requests data from the project root', () => {
    const records = loadSourceRequests();

    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.requestId && record.requester.name)).toBe(true);
  });

  test('selectors choose the lexicographically smallest requestId', () => {
    const records = [request({ requestId: 'ar-z' }), request({ requestId: 'ar-a' })];

    expect(firstPending(records).requestId).toBe('ar-a');
  });

  test('selects first pending records by risk membership and an already decided record', () => {
    const records = [
      request({ requestId: 'ar-0', status: 'CANCELLED' }),
      request({ requestId: 'ar-3', riskFlags: ['SOD_CONFLICT'] }),
      request({ requestId: 'ar-1', riskFlags: [] }),
      request({ requestId: 'ar-2', status: 'DENIED', decision: {
        outcome: 'DENIED', decidedBy: 'Reviewer', decidedAt: '2026-01-02T00:00:00Z', justification: 'No',
      } }),
    ];

    expect(firstPendingWithRiskFlag(records).requestId).toBe('ar-3');
    expect(firstPendingWithoutRiskFlag(records).requestId).toBe('ar-1');
    expect(firstAlreadyDecided(records).requestId).toBe('ar-2');
    expect(distinctPending(2, records).map(({ requestId }) => requestId)).toEqual(['ar-1', 'ar-3']);
  });

  test('reports the selector precondition and available status and risk distributions', () => {
    const records = [request({ status: 'APPROVED', riskFlags: ['SOD_CONFLICT'] })];

    expect(() => firstPendingWithoutRiskFlag(records)).toThrow(
      /pending request without risk flags.*status.*APPROVED.*risk flags.*SOD_CONFLICT/i,
    );
  });
});

describe('expected list helpers', () => {
  const records = [
    request({ requestId: 'ar-2', requester: { name: 'Ada Lovelace' }, resource: { name: 'Payroll' }, priority: 'HIGH', requestedAt: '2026-01-02T00:00:00Z', dueDate: undefined }),
    request({ requestId: 'ar-1', requester: { name: 'Grace Hopper' }, resource: { name: 'Archive' }, priority: 'LOW', requestedAt: '2026-01-01T00:00:00Z', dueDate: '2026-01-03', riskFlags: ['SOD_CONFLICT'] }),
    request({ requestId: 'ar-3', status: 'APPROVED', requester: { name: 'Linus' }, resource: { name: 'Portal' }, priority: 'NORMAL', requestedAt: '2026-01-03T00:00:00Z', dueDate: '2026-01-01' }),
  ];

  test('filters exact status/type/risk and searches requester, resource, and requestId case-insensitively', () => {
    expect(expectedList({ status: 'PENDING', type: 'GRANT', riskFlag: 'SOD_CONFLICT' }, records).total).toBe(1);
    expect(expectedList({ search: 'ADA' }, records).items.map((item) => item.requestId)).toEqual(['ar-2']);
    expect(expectedList({ search: 'chIv' }, records).items.map((item) => item.requestId)).toEqual(['ar-1']);
    expect(expectedList({ search: 'AR-3' }, records).items.map((item) => item.requestId)).toEqual(['ar-3']);
  });

  test('defaults to first page, size 25, and requestedAt descending and clamps page size to 100', () => {
    expect(expectedList({}, records)).toMatchObject({ page: 1, pageSize: 25, total: 3 });
    expect(expectedList({}, records).items.map((item) => item.requestId)).toEqual(['ar-3', 'ar-2', 'ar-1']);
    expect(expectedList({ pageSize: 999 }, records).pageSize).toBe(100);
  });

  test('uses LOW < NORMAL < HIGH priority ordering', () => {
    expect(priorityRank('LOW')).toBeLessThan(priorityRank('NORMAL'));
    expect(priorityRank('NORMAL')).toBeLessThan(priorityRank('HIGH'));
    expect(sortRequests(records, 'priority', 'asc').map((item) => item.requestId)).toEqual(['ar-1', 'ar-3', 'ar-2']);
  });

  test('sorts absent due dates last in both directions', () => {
    expect(sortRequests(records, 'dueDate', 'asc').map((item) => item.requestId)).toEqual(['ar-3', 'ar-1', 'ar-2']);
    expect(sortRequests(records, 'dueDate', 'desc').map((item) => item.requestId)).toEqual(['ar-1', 'ar-3', 'ar-2']);
  });

  test('does not impose an unspecified requestId tie-break for general sorts', () => {
    const ties = [
      request({ requestId: 'ar-z', requestedAt: '2026-01-01T00:00:00Z' }),
      request({ requestId: 'ar-a', requestedAt: '2026-01-01T00:00:00Z' }),
    ];

    expect(sortRequests(ties, 'requestedAt', 'asc').map((item) => item.requestId)).toEqual(['ar-z', 'ar-a']);
  });
});
