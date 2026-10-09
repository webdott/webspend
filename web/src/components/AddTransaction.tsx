import { createContext, useContext, useEffect, useState, type FormEvent } from 'react';
import type { Account, TransactionType } from '@webspend/shared';
import { BANK_LABELS, parseMinor } from '@webspend/shared';
import { api } from '../api/client.ts';
import { useAccounts, useCategories, useInvalidateLedger } from '../api/hooks.ts';
import { inputToIso, nowForInput } from '../lib/dates.ts';
import { Notice, errorMessage } from './ui.tsx';
import { useUser } from './user.ts';

/** Opens the add-a-transaction dialog. Provided by the Shell, so any page can offer the button. */
export const AddTransactionContext = createContext<() => void>(() => {});

export function useAddTransaction(): () => void {
  return useContext(AddTransactionContext);
}

export function AddTransactionButton({ className = '' }: { className?: string }) {
  const open = useAddTransaction();
  return (
    <button type="button" className={`btn btn--primary ${className}`.trim()} onClick={open}>
      <span aria-hidden="true">+</span> Add
    </button>
  );
}

const CASH = 'cash';
const LAST_ACCOUNT_KEY = 'webspend.addTransaction.account';

function rememberedAccount(): string | null {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

/** The account used last time if it still exists, else the first tracked one, else the first. */
function defaultAccount(accounts: Account[]): string {
  const last = rememberedAccount();
  if (last && accounts.some((a) => a.id === last)) return last;
  return (accounts.find((a) => a.tracked) ?? accounts[0])?.id ?? CASH;
}

export function AddTransactionDialog({ onClose }: { onClose: () => void }) {
  const user = useUser();
  const accounts = useAccounts();
  const categories = useCategories();
  const invalidate = useInvalidateLedger();
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [when, setWhen] = useState(nowForInput());
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = accounts.data?.accounts ?? [];
  const hasCash = list.some((a) => a.bank === 'cash');
  const account = list.find((a) => a.id === accountId);
  const currency = account?.currency ?? user.defaultCurrency;

  useEffect(() => {
    if (!accountId && accounts.data) setAccountId(defaultAccount(accounts.data.accounts));
  }, [accounts.data, accountId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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
      let target = accountId;
      if (target === CASH) {
        const created = await api.createAccount({
          bank: 'cash',
          name: 'Cash',
          isOwn: true,
          currency: user.defaultCurrency,
        });
        target = created.account.id;
      }
      await api.createTransaction({
        accountId: target,
        occurredAt: inputToIso(when),
        type,
        amountMinor: minor,
        currency,
        userDescription: description.trim(),
        categoryId: type === 'transfer' ? null : categoryId || null,
      });
      try {
        localStorage.setItem(LAST_ACCOUNT_KEY, target);
      } catch {
        // Remembering the account is a convenience; the transaction is already saved.
      }
      await invalidate();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div
      className="modal"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="modal__panel stack"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-tx-title"
        onSubmit={submit}
      >
        <div className="row row--between">
          <h2 id="add-tx-title" className="section-title" style={{ margin: 0 }}>
            Add a transaction
          </h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="caption" style={{ margin: 0 }}>
          For anything your bank did not email about, like airtime, or cash you spent.
        </p>

        <div className="field">
          <label htmlFor="add-account">Account</label>
          <select
            id="add-account"
            className="select"
            value={accountId}
            disabled={accounts.isPending}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {list.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.name === BANK_LABELS[a.bank] ? '' : ` · ${BANK_LABELS[a.bank]}`}
                {a.accountNumber ? ` · ${a.accountNumber}` : ''}
              </option>
            ))}
            {hasCash ? null : <option value={CASH}>Cash</option>}
          </select>
        </div>
        <div className="field">
          <label htmlFor="add-desc">What was it</label>
          <input
            id="add-desc"
            className="input"
            required
            autoFocus
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Airtime top-up"
          />
        </div>
        <div className="grid-2" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="add-amount">Amount ({currency})</label>
            <input
              id="add-amount"
              className="input mono"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="2,500"
            />
          </div>
          <div className="field">
            <label htmlFor="add-when">When</label>
            <input
              id="add-when"
              className="input"
              type="datetime-local"
              required
              max={nowForInput()}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="add-type">Type</label>
            <select
              id="add-type"
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
            <label htmlFor="add-cat">Category</label>
            <select
              id="add-cat"
              className="select"
              value={type === 'transfer' ? '' : categoryId}
              disabled={type === 'transfer'}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">{type === 'transfer' ? 'Not needed' : 'Needs a category'}</option>
              {categories.data?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error ? <Notice kind="error">{error}</Notice> : null}
        {accounts.isError ? <Notice kind="error">{errorMessage(accounts.error)}</Notice> : null}
        <div className="row">
          <button type="submit" className="btn btn--primary" disabled={busy || !accountId}>
            Add transaction
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
