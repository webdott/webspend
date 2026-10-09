import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { TransactionType } from '@webspend/shared';
import { parseMinor } from '@webspend/shared';
import { api, type TransactionsQuery } from '../api/client.ts';
import { useAccounts, useCategories, useInvalidateLedger, useTransactions } from '../api/hooks.ts';
import { MonthPicker } from '../components/MonthPicker.tsx';
import { TransactionRow } from '../components/TransactionRow.tsx';
import { EmptyState, ErrorState, LoadingState, Notice, errorMessage } from '../components/ui.tsx';
import { showsUsd, useUser } from '../components/user.ts';
import { groupByDay, inputToIso, isValidMonth, nowForInput } from '../lib/dates.ts';

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
  const [adding, setAdding] = useState(false);

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
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setAdding((a) => !a)}
          aria-expanded={adding}
        >
          + Cash
        </button>
      </div>

      {adding ? <CashForm onDone={() => setAdding(false)} /> : null}

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
                : 'No transactions here yet. They appear as bank alerts arrive, or add cash with “+ Cash”.'}
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

function CashForm({ onDone }: { onDone: () => void }) {
  const user = useUser();
  const accounts = useAccounts();
  const categories = useCategories();
  const invalidate = useInvalidateLedger();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [when, setWhen] = useState(nowForInput());
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cash = accounts.data?.accounts.find((a) => a.bank === 'cash');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const minor = parseMinor(amount);
    if (minor === null || minor <= 0) {
      setError('Enter an amount like 2,500 or 1500.50.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let accountId = cash?.id;
      if (!accountId) {
        const created = await api.createAccount({
          bank: 'cash',
          name: 'Cash',
          isOwn: true,
          currency: user.defaultCurrency,
        });
        accountId = created.account.id;
      }
      await api.createTransaction({
        accountId,
        occurredAt: inputToIso(when),
        type,
        amountMinor: minor,
        currency: cash?.currency ?? user.defaultCurrency,
        userDescription: description.trim(),
        categoryId: categoryId || null,
      });
      await invalidate();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card stack"
      style={{ gap: 14 }}
      onSubmit={submit}
      aria-label="Add a cash transaction"
    >
      <div className="row row--between">
        <strong>Cash transaction</strong>
        <span className="caption">Goes on the Cash account</span>
      </div>
      <div className="field">
        <label htmlFor="cash-desc">What was it</label>
        <input
          id="cash-desc"
          className="input"
          required
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Suya at the junction"
        />
      </div>
      <div className="grid-2" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="cash-amount">Amount ({cash?.currency ?? user.defaultCurrency})</label>
          <input
            id="cash-amount"
            className="input mono"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="2,500"
          />
        </div>
        <div className="field">
          <label htmlFor="cash-when">When</label>
          <input
            id="cash-when"
            className="input"
            type="datetime-local"
            required
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="cash-type">Type</label>
          <select
            id="cash-type"
            className="select"
            value={type}
            onChange={(e) => setType(e.target.value as TransactionType)}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer to self</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="cash-cat">Category</label>
          <select
            id="cash-cat"
            className="select"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Needs a category</option>
            {categories.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <div className="row">
        <button type="submit" className="btn btn--primary" disabled={busy || accounts.isPending}>
          Add
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          Cancel
        </button>
        {accounts.isError ? (
          <span className="small danger-text">{errorMessage(accounts.error)}</span>
        ) : null}
        {accounts.isSuccess && !cash ? (
          <span className="caption">A Cash account will be created.</span>
        ) : null}
        <Link to="/accounts" className="small" style={{ marginLeft: 'auto' }}>
          Accounts
        </Link>
      </div>
    </form>
  );
}
