import type {
  AccessRequest,
  ApiError,
  ApiResponse,
  BulkDecisionBody,
  BulkDecisionResponse,
  DecisionBody,
  ListRequestsQuery,
  ListRequestsResponse,
  ResetResponse,
} from './types';

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

const errorStatuses = [400, 404, 409, 422] as const;
const errorCodes = [
  'NOT_FOUND',
  'ALREADY_DECIDED',
  'STALE_VERSION',
  'JUSTIFICATION_REQUIRED',
  'TOO_MANY_ITEMS',
  'BAD_REQUEST',
] as const;

function isApiError(body: unknown): body is ApiError {
  if (typeof body !== 'object' || body === null) return false;
  const candidate = body as { error?: unknown; message?: unknown };
  return (
    typeof candidate.error === 'string' &&
    errorCodes.includes(candidate.error as (typeof errorCodes)[number]) &&
    (candidate.message === undefined || typeof candidate.message === 'string')
  );
}

async function parseBody(response: Response): Promise<{ body: unknown; isJson: boolean }> {
  const text = await response.text();
  if (text === '') return { body: null, isJson: false };
  try {
    return { body: JSON.parse(text), isJson: true };
  } catch {
    return { body: text, isJson: false };
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const { body, isJson } = await parseBody(response);
  if (response.status === 200 && isJson) return { kind: 'success', status: 200, body: body as T };
  if (errorStatuses.includes(response.status as (typeof errorStatuses)[number]) && isJson && isApiError(body)) {
    return { kind: 'error', status: response.status as 400 | 404 | 409 | 422, body };
  }
  return {
    kind: 'unexpected',
    status: response.status,
    body,
  };
}

function queryString(query: ListRequestsQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const api = {
  listRequests(query: ListRequestsQuery = {}): Promise<ApiResponse<ListRequestsResponse>> {
    return request(`/requests${queryString(query)}`);
  },

  getRequest(requestId: string): Promise<ApiResponse<AccessRequest>> {
    return request(`/requests/${encodeURIComponent(requestId)}`);
  },

  decide(requestId: string, body: DecisionBody): Promise<ApiResponse<AccessRequest>> {
    return request(`/requests/${encodeURIComponent(requestId)}/decision`, jsonBody(body));
  },

  bulkDecide(body: BulkDecisionBody): Promise<ApiResponse<BulkDecisionResponse>> {
    return request('/requests/bulk-decision', jsonBody(body));
  },

  reset(): Promise<ApiResponse<ResetResponse>> {
    return request('/__admin/reset', jsonBody({}));
  },
};

export { baseUrl };
