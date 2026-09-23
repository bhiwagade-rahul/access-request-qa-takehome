import { api } from '../../src/api-client';
import { assertListEnvelope, assertOrderedIds } from '../../src/assertions';
import { expectedList, filterRequests, sourceRequests } from '../../src/test-data';
import { resetService } from '../../src/test-setup';
import type { AccessRequest, ListRequestsQuery } from '../../src/types';

const statuses = ['PENDING', 'APPROVED', 'DENIED', 'CANCELLED'] as const;
const types = ['GRANT', 'REVOKE'] as const;
const riskFlags = [...new Set(sourceRequests.flatMap(({ riskFlags = [] }) => riskFlags))].sort();

beforeEach(resetService);
afterAll(resetService);

function sortedValues(records: readonly AccessRequest[], query: Pick<ListRequestsQuery, 'sortBy' | 'sortDir'>): Array<string | number> {
  return records.map((record) => {
    switch (query.sortBy) {
      case 'requestedAt': return record.requestedAt;
      case 'dueDate': return record.dueDate ?? '';
      case 'requester': return record.requester.name;
      case 'resource': return record.resource.name;
      case 'priority': return { LOW: 0, NORMAL: 1, HIGH: 2 }[record.priority];
      default: throw new Error(`Unsupported sort field: ${query.sortBy}`);
    }
  });
}

function expectMonotonic(values: readonly (string | number)[], direction: 'asc' | 'desc'): void {
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    const left = typeof previous === 'string' ? previous.toLocaleLowerCase() : previous;
    const right = typeof current === 'string' ? current.toLocaleLowerCase() : current;
    expect(direction === 'asc' ? left <= right : left >= right).toBe(true);
  }
}

describe('GET /requests valid filters', () => {
  test.each(statuses)('filters by status %s', async (status) => {
    const response = await api.listRequests({ status, pageSize: 100 });
    const expected = expectedList({ status, pageSize: 100 });

    expect(response.kind).toBe('success');
    if (response.kind !== 'success') return;
    assertListEnvelope(response.body, expected);
    assertOrderedIds(response.body.items, expected.items.map(({ requestId }) => requestId));
  });

  test.each(types)('filters by type %s', async (type) => {
    const response = await api.listRequests({ type, pageSize: 100 });
    const expected = expectedList({ type, pageSize: 100 });

    expect(response.kind).toBe('success');
    if (response.kind !== 'success') return;
    assertListEnvelope(response.body, expected);
    assertOrderedIds(response.body.items, expected.items.map(({ requestId }) => requestId));
  });

  test.each(riskFlags)('filters by exact risk flag %s', async (riskFlag) => {
    const response = await api.listRequests({ riskFlag, pageSize: 100 });
    const expected = expectedList({ riskFlag, pageSize: 100 });

    expect(response.kind).toBe('success');
    if (response.kind !== 'success') return;
    assertListEnvelope(response.body, expected);
    assertOrderedIds(response.body.items, expected.items.map(({ requestId }) => requestId));
  });

  test('searches requester, resource, and request ID case-insensitively', async () => {
    const candidates = [
      sourceRequests[0].requester.name,
      sourceRequests[0].resource.name,
      sourceRequests[0].requestId.slice(3),
    ];

    for (const search of candidates) {
      const query = { search: search.toUpperCase(), pageSize: 100 };
      const response = await api.listRequests(query);
      const expected = expectedList(query);

      expect(response.kind).toBe('success');
      if (response.kind !== 'success') continue;
      assertListEnvelope(response.body, expected);
      assertOrderedIds(response.body.items, expected.items.map(({ requestId }) => requestId));
    }
  });

  test('reports filtered totals and page metadata', async () => {
    const status = 'PENDING';
    const query = { status, page: 2, pageSize: 3 } as const;
    const response = await api.listRequests(query);
    const expected = expectedList(query);

    expect(response.kind).toBe('success');
    if (response.kind !== 'success') return;
    assertListEnvelope(response.body, expected);
    expect(response.body.total).toBe(filterRequests(sourceRequests, { status }).length);
    assertOrderedIds(response.body.items, expected.items.map(({ requestId }) => requestId));
  });
});

describe('GET /requests documented sorting', () => {
  test.each([
    ['requestedAt', 'asc'], ['requestedAt', 'desc'],
    ['dueDate', 'asc'], ['dueDate', 'desc'],
    ['requester', 'asc'], ['requester', 'desc'],
    ['resource', 'asc'], ['resource', 'desc'],
    ['priority', 'asc'], ['priority', 'desc'],
  ] as const)('sorts by %s %s without requiring an undocumented tie-breaker', async (sortBy, sortDir) => {
    const query = { sortBy, sortDir, pageSize: 100 } as const;
    const response = await api.listRequests(query);

    expect(response.kind).toBe('success');
    if (response.kind !== 'success') return;

    expect(response.body.total).toBe(sourceRequests.length);
    expect(response.body.items.map(({ requestId }) => requestId).sort()).toEqual(sourceRequests.map(({ requestId }) => requestId).sort());
    const present = sortBy === 'dueDate'
      ? response.body.items.filter(({ dueDate }) => dueDate !== undefined)
      : response.body.items;
    expectMonotonic(sortedValues(present, query), sortDir);

    if (sortBy === 'dueDate') {
      const missingStart = response.body.items.findIndex(({ dueDate }) => dueDate === undefined);
      if (missingStart !== -1) {
        expect(response.body.items.slice(missingStart).every(({ dueDate }) => dueDate === undefined)).toBe(true);
      }
    }
  });
});
