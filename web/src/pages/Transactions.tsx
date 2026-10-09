import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TransactionsQuery } from '../api/client.ts';
import { useCategories, useTransactions } from '../api/hooks.ts';
import { AddTransactionButton } from '../components/AddTransaction.tsx';
import { MonthPicker } from '../components/MonthPicker.tsx';
import { TransactionRow } from '../components/TransactionRow.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui.tsx';
import { showsUsd, useUser } from '../components/user.ts';
import { groupByDay, isValidMonth } from '../lib/dates.ts';

type Filter = 'all' | 'uncategorised' | 'unsure' | 'expense' | 'income' | 'transfer';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'uncategorised', label: 'Needs a category' },
  { value: 'unsure', label: 'Unsure' },
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfers' },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Transactions() {
  const user = useUser();
  const showUsd = showsUsd(user);
  const [params, setParams] = useSearchParams();
  const filter = (
    FILTERS.some((f) => f.value === params.get('filter')) ? params.get('filter') : 'all'
  ) as Filter;
  const month = params.get('month'); // null means every month
  const categoryId = params.get('categoryId');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search.trim(), 300);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || (k === 'filter' && v === 'all')) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if ((params.get('q') ?? '') !== q) update({ q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const query = useMemo<TransactionsQuery>(() => {
    const base: TransactionsQuery = { limit: 50 };
    if (month && isValidMonth(month)) base.month = month;
    if (q) base.q = q;
    if (filter === 'uncategorised') {
      // Only expenses need a category; income and transfers without one are fine.
      base.categoryId = 'none';
      base.type = 'expense';
    } else if (categoryId) base.categoryId = categoryId;
    if (filter === 'expense' || filter === 'income' || filter === 'transfer') base.type = filter;
    if (filter === 'unsure') base.unsure = true;
    return base;
  }, [month, q, filter, categoryId]);

  const list = useTransactions(query);
  const items = list.data?.pages.flatMap((p) => p.transactions) ?? [];
  const groups = useMemo(() => groupByDay(items), [items]);
  const categories = useCategories();
  const categoryName = categoryId
    ? categories.data?.categories.find((c) => c.id === categoryId)?.name
    : null;

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title">Transactions</h1>
        <AddTransactionButton />
      </div>

      <div className="stack" style={{ gap: 12 }}>
        <label className="visually-hidden" htmlFor="tx-search">
          Search transactions
        </label>
        <input
          id="tx-search"
          type="search"
          className="input input--search"
          placeholder="Search title, description or payee"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="row row--between row--wrap">
          <div className="pills" role="group" aria-label="Filter">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className="pill"
                aria-pressed={filter === f.value}
                onClick={() => update({ filter: f.value })}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="row">
            <MonthPicker
              compact
              month={month && isValidMonth(month) ? month : null}
              onChange={(value) => update({ month: value })}
            />
            {month ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => update({ month: null })}
              >
                All months
              </button>
            ) : null}
          </div>
        </div>
        {categoryName ? (
          <div className="row small muted">
            In <strong style={{ color: 'var(--ink)' }}>{categoryName}</strong>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => update({ categoryId: null })}
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>

      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState error={list.error} retry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState>
            {q
              ? `Nothing matches “${q}”.`
              : filter === 'uncategorised'
                ? 'Everything has a category. Nice.'
                : 'No transactions here yet. They appear as bank alerts arrive, or use Add for anything the bank did not email about.'}
          </EmptyState>
        </div>
      ) : (
        <div>
          {groups.map((g) => (
            <section key={g.day} aria-label={g.heading}>
              <h2 className="day-heading">{g.heading}</h2>
              <div className="tx-list">
                {g.items.map((t) => (
                  <TransactionRow key={t.id} t={t} showUsd={showUsd} />
                ))}
              </div>
            </section>
          ))}
          {list.hasNextPage ? (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button
                type="button"
                className="btn"
                disabled={list.isFetchingNextPage}
                onClick={() => list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
