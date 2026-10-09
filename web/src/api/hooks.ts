/** React Query hooks over the client. Keys are grouped so mutations can invalidate by prefix. */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  MeResponse,
  UpdateAccountRequest,
  UpdateSettingsRequest,
  UpdateTransactionRequest,
} from '@webspend/shared';
import { api, isApiError, type TransactionsQuery } from './client.ts';

export const keys = {
  meta: ['meta'] as const,
  me: ['me'] as const,
  summary: (month: string) => ['summary', month] as const,
  transactions: (q: TransactionsQuery) => ['transactions', q] as const,
  transaction: (id: string) => ['transaction', id] as const,
  categories: ['categories'] as const,
  accounts: ['accounts'] as const,
  gaps: ['gaps'] as const,
  alerts: ['alerts'] as const,
  rates: ['rates'] as const,
};

export function useMeta() {
  return useQuery({ queryKey: keys.meta, queryFn: api.meta, staleTime: Infinity, retry: false });
}

export function useMe(options?: Partial<UseQueryOptions<MeResponse>>) {
  return useQuery({
    queryKey: keys.me,
    queryFn: api.me,
    staleTime: 5 * 60_000,
    retry: (count, err) => !isApiError(err) && count < 2,
    ...options,
  });
}

export function useSummary(month: string) {
  return useQuery({ queryKey: keys.summary(month), queryFn: () => api.summary(month) });
}

export function useTransactions(query: TransactionsQuery) {
  return useInfiniteQuery({
    queryKey: keys.transactions(query),
    queryFn: ({ pageParam }) => api.transactions({ ...query, before: pageParam ?? undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.transactions.at(-1)?.occurredAt : undefined),
  });
}

export function useTransaction(id: string) {
  return useQuery({ queryKey: keys.transaction(id), queryFn: () => api.transaction(id) });
}

export function useCategories() {
  return useQuery({ queryKey: keys.categories, queryFn: api.categories, staleTime: 60_000 });
}

export function useAccounts() {
  return useQuery({ queryKey: keys.accounts, queryFn: api.accounts, staleTime: 30_000 });
}

export function useGaps() {
  return useQuery({ queryKey: keys.gaps, queryFn: () => api.gaps('open') });
}

export function useFailedAlerts(enabled = true) {
  return useQuery({ queryKey: keys.alerts, queryFn: api.failedAlerts, enabled });
}

export function useRates() {
  return useQuery({ queryKey: keys.rates, queryFn: () => api.rates(), staleTime: 10 * 60_000 });
}

export function useInvalidateLedger() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['summary'] }),
      qc.invalidateQueries({ queryKey: ['transactions'] }),
      qc.invalidateQueries({ queryKey: ['transaction'] }),
      qc.invalidateQueries({ queryKey: keys.gaps }),
      qc.invalidateQueries({ queryKey: keys.accounts }),
    ]);
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSettingsRequest) => api.updateSettings(body),
    onSuccess: (res) => {
      qc.setQueryData(keys.me, res);
      // Default-currency changes affect every amount shown.
      qc.invalidateQueries({ queryKey: ['summary'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['transaction'] });
    },
  });
}

export function useUpdateTransaction(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: UpdateTransactionRequest) => api.updateTransaction(id, body),
    onSuccess: (res) => {
      qc.setQueryData(keys.transaction(id), res);
      void invalidate();
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAccountRequest }) =>
      api.updateAccount(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.accounts });
      qc.invalidateQueries({ queryKey: ['summary'] });
    },
  });
}
