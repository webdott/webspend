/**
 * Typed fetch wrapper over the contract in `@webspend/shared` (shared/src/api.ts).
 *
 * - Same origin by default (`/api`, `/auth`); Vite proxies both to the server in dev.
 *   `VITE_API_URL` overrides the origin for production builds.
 * - `VITE_MOCK=1` swaps every request for the in-memory fake in `./mock.ts`.
 */
import type {
  AccountResponse,
  AccountsResponse,
  AlertsResponse,
  CategoriesResponse,
  CategoryResponse,
  CreateAccountRequest,
  CreateCategoryRequest,
  CreateTransactionRequest,
  CreateTransactionResponse,
  DevSignInRequest,
  GapResponse,
  GapsResponse,
  ImportCommitRequest,
  ImportCommitResponse,
  ImportPreviewRequest,
  ImportPreviewResponse,
  MeResponse,
  MetaResponse,
  RatesResponse,
  SessionResponse,
  SummaryResponse,
  TransactionResponse,
  TransactionsResponse,
  TransactionType,
  UpdateAccountRequest,
  UpdateCategoryRequest,
  UpdateGapRequest,
  UpdateSettingsRequest,
  UpdateSettingsResponse,
  UpdateTransactionRequest,
  UpdateTransactionResponse,
} from '@webspend/shared';

export const MOCK = import.meta.env.VITE_MOCK === '1';
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
export type Query = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(method: Method, path: string, body?: unknown, query?: Query): Promise<T> {
  const url = withQuery(path, query);
  if (MOCK) {
    const { mockRequest } = await import('./mock.ts');
    return mockRequest(method, url, body) as Promise<T>;
  }
  const res = await fetch(BASE + url, {
    method,
    credentials: 'include',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? `http_${res.status}`,
      err?.message ?? `Request failed with status ${res.status}`,
    );
  }
  return json as T;
}

export type TransactionsQuery = {
  month?: string;
  q?: string;
  categoryId?: string | 'none';
  accountId?: string;
  type?: TransactionType;
  limit?: number;
  before?: string;
};

export const api = {
  meta: () => request<MetaResponse>('GET', '/api/meta'),
  me: () => request<MeResponse>('GET', '/api/me'),
  devSignIn: (body: DevSignInRequest) => request<SessionResponse>('POST', '/auth/dev', body),
  logout: () => request<void>('POST', '/auth/logout'),
  updateSettings: (body: UpdateSettingsRequest) =>
    request<UpdateSettingsResponse>('PATCH', '/api/settings', body),

  summary: (month?: string) =>
    request<SummaryResponse>('GET', '/api/summary', undefined, { month }),

  transactions: (query: TransactionsQuery) =>
    request<TransactionsResponse>('GET', '/api/transactions', undefined, query),
  transaction: (id: string) => request<TransactionResponse>('GET', `/api/transactions/${id}`),
  updateTransaction: (id: string, body: UpdateTransactionRequest) =>
    request<UpdateTransactionResponse>('PATCH', `/api/transactions/${id}`, body),
  createTransaction: (body: CreateTransactionRequest) =>
    request<CreateTransactionResponse>('POST', '/api/transactions', body),
  deleteTransaction: (id: string) => request<void>('DELETE', `/api/transactions/${id}`),

  categories: () => request<CategoriesResponse>('GET', '/api/categories'),
  createCategory: (body: CreateCategoryRequest) =>
    request<CategoryResponse>('POST', '/api/categories', body),
  updateCategory: (id: string, body: UpdateCategoryRequest) =>
    request<CategoryResponse>('PATCH', `/api/categories/${id}`, body),
  deleteCategory: (id: string) => request<void>('DELETE', `/api/categories/${id}`),

  accounts: () => request<AccountsResponse>('GET', '/api/accounts'),
  createAccount: (body: CreateAccountRequest) =>
    request<AccountResponse>('POST', '/api/accounts', body),
  updateAccount: (id: string, body: UpdateAccountRequest) =>
    request<AccountResponse>('PATCH', `/api/accounts/${id}`, body),
  deleteAccount: (id: string) => request<void>('DELETE', `/api/accounts/${id}`),

  gaps: (status: 'open' | 'filled' | 'dismissed' = 'open') =>
    request<GapsResponse>('GET', '/api/gaps', undefined, { status }),
  updateGap: (id: string, body: UpdateGapRequest) =>
    request<GapResponse>('PATCH', `/api/gaps/${id}`, body),

  failedAlerts: () =>
    request<AlertsResponse>('GET', '/api/alerts', undefined, { status: 'failed' }),

  rates: (day?: string) => request<RatesResponse>('GET', '/api/rates', undefined, { day }),

  importPreview: (body: ImportPreviewRequest) =>
    request<ImportPreviewResponse>('POST', '/api/imports/preview', body),
  importCommit: (body: ImportCommitRequest) =>
    request<ImportCommitResponse>('POST', '/api/imports', body),
};

export type Api = typeof api;
