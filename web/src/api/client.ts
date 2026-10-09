/**
 * Typed fetch wrapper over the contract in `@webspend/shared` (shared/src/api.ts).
 *
 * - Same origin by default (`/api`, `/auth`); Vite proxies both to the server in dev.
 *   `VITE_API_URL` overrides the origin for production builds.
 * - `VITE_MOCK=1` swaps every request for the in-memory fake in `./mock.ts`.
 */
import { dayOf } from '../lib/dates.ts';
import { exportFilename, exportPath } from '../lib/export.ts';
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
  UpdateSettingsRequest,
  UpdateSettingsResponse,
  UpdateTransactionRequest,
  UpdateTransactionResponse,
  ExportQuery,
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
  unsure?: boolean;
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

  failedAlerts: () =>
    request<AlertsResponse>('GET', '/api/alerts', undefined, { status: 'failed' }),

  rates: (day?: string) => request<RatesResponse>('GET', '/api/rates', undefined, { day }),

  importPreview: (body: ImportPreviewRequest) =>
    request<ImportPreviewResponse>('POST', '/api/imports/preview', body),
  importCommit: (body: ImportCommitRequest) =>
    request<ImportCommitResponse>('POST', '/api/imports', body),

  /**
   * Where to download an export from. The real server builds the file and names it through
   * `Content-Disposition`; the session cookie goes along with the navigation. The mock builds a
   * CSV in the page and hands back an object URL to release after the click.
   */
  exportFile: async (query: ExportQuery): Promise<ExportFile> => {
    const range = exportRange(query);
    const filename = exportFilename(query, range);
    if (MOCK) {
      const { mockExportCsv } = await import('./mock.ts');
      if (query.format !== 'csv') {
        throw new ApiError(501, 'mock_unsupported', 'PDF export needs the real server.');
      }
      const url = URL.createObjectURL(
        new Blob([mockExportCsv({ ...query, ...range })], { type: 'text/csv;charset=utf-8' }),
      );
      return { url, filename, release: () => URL.revokeObjectURL(url) };
    }
    return { url: BASE + exportPath({ ...query, ...range }), filename };
  },
};

export type ExportFile = { url: string; filename: string; release?: () => void };

/** `to` defaults to today and `from` to the first of that month, as the server does. */
function exportRange(query: ExportQuery): { from: string; to: string } {
  const to = query.to ?? dayOf(new Date());
  return { from: query.from ?? `${to.slice(0, 7)}-01`, to };
}

export type Api = typeof api;
