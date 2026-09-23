import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AccessRequest, ListRequestsQuery, ListRequestsResponse, Priority } from './types';

const sourceDataPath = resolve(__dirname, '..', 'service', 'data', 'requests.json');
const priorityRanks: Record<Priority, number> = { LOW: 0, NORMAL: 1, HIGH: 2 };

export function loadSourceRequests(): AccessRequest[] {
  return JSON.parse(readFileSync(sourceDataPath, 'utf8')) as AccessRequest[];
}

export const sourceRequests = loadSourceRequests();

function distributions(records: readonly AccessRequest[]): string {
  const counts = (values: string[]) => Object.entries(values.reduce<Record<string, number>>(
    (result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {},
  )).map(([value, count]) => `${value}:${count}`).join(', ') || 'none';

  return `status distribution [${counts(records.map(({ status }) => status))}]; risk flags [${counts(records.flatMap(({ riskFlags = [] }) => riskFlags))}]`;
}

function firstMatching(
  records: readonly AccessRequest[],
  precondition: string,
  matches: (record: AccessRequest) => boolean,
): AccessRequest {
  const selected = records.filter(matches).sort((left, right) => left.requestId.localeCompare(right.requestId))[0];
  if (!selected) throw new Error(`Cannot select ${precondition}; ${distributions(records)}.`);
  return selected;
}

export function firstPending(records: readonly AccessRequest[] = sourceRequests): AccessRequest {
  return firstMatching(records, 'pending request', (record) => record.status === 'PENDING');
}

export function firstPendingWithRiskFlag(records: readonly AccessRequest[] = sourceRequests): AccessRequest {
  return firstMatching(records, 'pending request with risk flags', (record) => record.status === 'PENDING' && (record.riskFlags?.length ?? 0) > 0);
}

export function firstPendingWithoutRiskFlag(records: readonly AccessRequest[] = sourceRequests): AccessRequest {
  return firstMatching(records, 'pending request without risk flags', (record) => record.status === 'PENDING' && (record.riskFlags?.length ?? 0) === 0);
}

export function firstAlreadyDecided(records: readonly AccessRequest[] = sourceRequests): AccessRequest {
  return firstMatching(records, 'already decided request', (record) => record.decision !== null);
}

export function distinctPending(count = 2, records: readonly AccessRequest[] = sourceRequests): AccessRequest[] {
  const selected = records.filter((record) => record.status === 'PENDING').sort((left, right) => left.requestId.localeCompare(right.requestId)).slice(0, count);
  if (selected.length !== count) {
    throw new Error(`Cannot select ${count} distinct pending requests; ${distributions(records)}.`);
  }
  return selected;
}

export function priorityRank(priority: Priority): number {
  return priorityRanks[priority];
}

export function filterRequests(records: readonly AccessRequest[], query: Pick<ListRequestsQuery, 'status' | 'type' | 'riskFlag' | 'search'>): AccessRequest[] {
  const needle = query.search?.toLowerCase();
  return records.filter((record) =>
    (!query.status || record.status === query.status)
    && (!query.type || record.type === query.type)
    && (!query.riskFlag || record.riskFlags?.includes(query.riskFlag))
    && (!needle || [record.requester.name, record.resource.name, record.requestId].some((value) => value.toLowerCase().includes(needle))),
  );
}

type SortBy = NonNullable<ListRequestsQuery['sortBy']>;
type SortDir = NonNullable<ListRequestsQuery['sortDir']>;

function sortableValue(record: AccessRequest, sortBy: SortBy): string | number | undefined {
  switch (sortBy) {
    case 'requestedAt': return record.requestedAt;
    case 'dueDate': return record.dueDate;
    case 'requester': return record.requester.name;
    case 'resource': return record.resource.name;
    case 'priority': return priorityRank(record.priority);
  }
}

export function sortRequests(records: readonly AccessRequest[], sortBy: SortBy = 'requestedAt', sortDir: SortDir = 'desc'): AccessRequest[] {
  const direction = sortDir === 'asc' ? 1 : -1;
  return [...records].sort((left, right) => {
    const leftValue = sortableValue(left, sortBy);
    const rightValue = sortableValue(right, sortBy);
    if (leftValue === undefined) return rightValue === undefined ? 0 : 1;
    if (rightValue === undefined) return -1;
    if (leftValue < rightValue) return -direction;
    if (leftValue > rightValue) return direction;
    return 0;
  });
}

export function expectedList(query: ListRequestsQuery = {}, records: readonly AccessRequest[] = sourceRequests): ListRequestsResponse {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 25, 100);
  const filtered = filterRequests(records, query);
  const sorted = sortRequests(filtered, query.sortBy, query.sortDir);
  return { items: sorted.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: filtered.length };
}
