export type RequestStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED';
export type RequestType = 'GRANT' | 'REVOKE';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH';
export type DecisionAction = 'APPROVE' | 'DENY';
export type DecisionOutcome = 'APPROVED' | 'DENIED';
export type KnownErrorCode =
  | 'NOT_FOUND'
  | 'ALREADY_DECIDED'
  | 'STALE_VERSION'
  | 'JUSTIFICATION_REQUIRED'
  | 'TOO_MANY_ITEMS';

export interface Requester {
  name: string;
  department?: string;
  manager?: string;
}

export interface Resource {
  name: string;
  system?: string;
  type?: string;
}

export interface Decision {
  outcome: DecisionOutcome;
  decidedBy: string;
  decidedAt: string;
  justification: string | null;
}

export interface HistoryEvent {
  at: string;
  event: string;
  actor: string;
}

export interface AccessRequest {
  requestId: string;
  type: RequestType;
  status: RequestStatus;
  priority: Priority;
  requester: Requester;
  resource: Resource;
  requesterJustification?: string;
  riskFlags?: string[];
  requestedAt: string;
  dueDate?: string;
  version: number;
  decision: Decision | null;
  history: HistoryEvent[];
  sodConflict?: boolean;
}

export interface ListRequestsQuery {
  status?: RequestStatus;
  type?: RequestType;
  riskFlag?: string;
  search?: string;
  sortBy?: 'requestedAt' | 'dueDate' | 'requester' | 'resource' | 'priority';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ListRequestsResponse {
  items: AccessRequest[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DecisionBody {
  decision: DecisionAction;
  justification?: string;
  version: number;
}

export interface BulkDecisionItem {
  requestId: string;
  version: number;
}

export interface BulkDecisionBody {
  items: BulkDecisionItem[];
  decision: DecisionAction;
  justification?: string;
}

export interface BulkDecisionResult {
  requestId: string;
  outcome: 'SUCCESS' | 'FAILED';
  reason?: KnownErrorCode | 'BAD_REQUEST';
}

export interface BulkDecisionResponse {
  results: BulkDecisionResult[];
}

export interface ApiError {
  error: KnownErrorCode | 'BAD_REQUEST';
  message?: string;
}

export interface ApiSuccessResponse<T> {
  kind: 'success';
  status: 200;
  body: T;
}

export interface ApiErrorResponse {
  kind: 'error';
  status: 400 | 404 | 409 | 422;
  body: ApiError;
}

export interface ApiUnexpectedResponse {
  kind: 'unexpected';
  status: number;
  body: unknown;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse | ApiUnexpectedResponse;

export interface ResetResponse {
  status: 'ok';
}
