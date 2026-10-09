import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Transaction, TransactionType, UpdateTransactionRequest } from '@webspend/shared';
import { formatApprox, formatSigned, parseMinor } from '@webspend/shared';
import { api } from '../api/client.ts';
import {
  useCategories,
  useInvalidateLedger,
  useTransaction,
  useUpdateTransaction,
} from '../api/hooks.ts';
import {
  ErrorState,
  LoadingState,
  Notice,
  Segmented,
  Switch,
  errorMessage,
  sourceLabel,
} from '../components/ui.tsx';
import { showsUsd, useUser } from '../components/user.ts';
import { formatDateTime, inputToIso, nowForInput } from '../lib/dates.ts';

const PROCESSORS = /paystack|flutterwave|interswitch|remita|monnify|squad|opay checkout/i;

export function TransactionDetail() {
  const { id = '' } = useParams();
  const user = useUser();
  const showUsd = showsUsd(user);
  const navigate = useNavigate();
  const tq = useTransaction(id);
  const categories = useCategories();
  const update = useUpdateTransaction(id);
  const invalidate = useInvalidateLedger();
  const t = tq.data?.transaction;

  const [remember, setRemember] = useState<boolean | null>(null);
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (t) setDescription(t.userDescription ?? '');
  }, [t?.id, t?.userDescription]); // eslint-disable-line react-hooks/exhaustive-deps

  if (tq.isPending) return <LoadingState />;
  if (tq.isError) return <ErrorState error={tq.error} retry={() => tq.refetch()} />;
  if (!t) return null;

  const isProcessor = !!t.counterpartyName && PROCESSORS.test(t.counterpartyName);
  const rememberOn = remember ?? !isProcessor;
  const canRemember = !!t.counterpartyName;

  const pickCategory = (categoryId: string | null) =>
    update.mutate({ categoryId, rememberForPayee: canRemember && rememberOn });

  const saveDescription = () => {
    const next = description.trim();
    if (next === (t.userDescription ?? '')) return;
    update.mutate({ userDescription: next || null });
  };

  async function remove() {
    if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteTransaction(t!.id);
      await invalidate();
      navigate('/transactions', { replace: true });
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeleting(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <div>
        <Link to="/transactions" className="back">
          ‹ Transactions
        </Link>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h1 className="page-title">{t.title}</h1>
          {editing ? null : (
            <button type="button" className="btn btn--sm" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
        <div className={`detail-amount${t.type === 'transfer' ? ' muted' : ''}`}>
          {formatSigned(t.amountMinor, t.currency, t.type)}
        </div>
        {showUsd && t.currency !== 'USD' ? (
          <div className="muted small">
            {formatApprox(t.usdMinor, 'USD') ?? 'No rate for this day yet'}
          </div>
        ) : null}
      </div>

      {editing ? (
        <EditDetails
          t={t}
          saving={update.isPending}
          onCancel={() => setEditing(false)}
          onSave={(patch) => update.mutate(patch, { onSuccess: () => setEditing(false) })}
        />
      ) : null}

      {t.unsureTransfer ? (
        <section className="card stack" style={{ gap: 10 }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Is this a transfer to yourself?
          </h2>
          <p className="small muted" style={{ margin: 0 }}>
            The other account
            {t.counterpartyAccount ? ` (${t.counterpartyAccount})` : ''} ends in the same digits as
            one of yours. It counts as {t.type === 'income' ? 'income' : 'an expense'} until you
            say.
          </p>
          <div className="row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={update.isPending}
              onClick={() => update.mutate({ type: 'transfer' })}
            >
              Yes, it is mine
            </button>
            <button
              type="button"
              className="btn"
              disabled={update.isPending}
              onClick={() => update.mutate({ type: t.type })}
            >
              No, keep as {t.type === 'income' ? 'income' : 'an expense'}
            </button>
          </div>
        </section>
      ) : null}

      <section className="card">
        <dl className="facts">
          <dt>Date</dt>
          <dd>{formatDateTime(t.occurredAt)}</dd>
          <dt>Account</dt>
          <dd>
            {t.accountName} · <span className="muted">{sourceLabel(t.source)}</span>
          </dd>
          {t.counterpartyName ? (
            <>
              <dt>{t.type === 'income' ? 'From' : 'To'}</dt>
              <dd>
                {t.counterpartyName}
                {t.counterpartyBank || t.counterpartyAccount ? (
                  <span className="muted">
                    {' '}
                    · {[t.counterpartyBank, t.counterpartyAccount].filter(Boolean).join(' ')}
                  </span>
                ) : null}
              </dd>
            </>
          ) : null}
          {t.bankDescription ? (
            <>
              <dt>Bank says</dt>
              <dd className="muted">{t.bankDescription}</dd>
            </>
          ) : null}
          {t.bankReference ? (
            <>
              <dt>Reference</dt>
              <dd className="mono small">{t.bankReference}</dd>
            </>
          ) : null}
          {t.isFee ? (
            <>
              <dt>Note</dt>
              <dd className="muted">Added by WebSpend when pairing a conversion.</dd>
            </>
          ) : null}
        </dl>
      </section>

      {t.type !== 'transfer' ? (
        <section className="card stack" style={{ gap: 14 }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            <span>Category</span>
            <Link to="/categories">Edit list</Link>
          </h2>
          {categories.isPending ? (
            <LoadingState />
          ) : categories.isError ? (
            <ErrorState error={categories.error} retry={() => categories.refetch()} />
          ) : categories.data.categories.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>
              No categories yet. <Link to="/categories">Add some</Link> to start sorting.
            </p>
          ) : (
            <div className="pills" role="group" aria-label="Category">
              {categories.data.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="pill"
                  aria-pressed={t.categoryId === c.id}
                  disabled={update.isPending}
                  onClick={() => pickCategory(t.categoryId === c.id ? null : c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <div className="switch-row">
            <div className="switch-row__text">
              <span>Remember for this payee</span>
              <span className="caption">
                {canRemember
                  ? 'Starts off for processors like Paystack'
                  : 'No payee on this transaction'}
              </span>
            </div>
            <Switch
              label="Remember category for this payee"
              checked={canRemember && rememberOn}
              disabled={!canRemember}
              onChange={(v) => {
                setRemember(v);
                if (t.categoryId) update.mutate({ categoryId: t.categoryId, rememberForPayee: v });
              }}
            />
          </div>
        </section>
      ) : null}

      <section className="card stack" style={{ gap: 10 }}>
        <label htmlFor="tx-desc" className="section-title" style={{ margin: 0 }}>
          Your description
        </label>
        <textarea
          id="tx-desc"
          className="textarea"
          maxLength={2000}
          placeholder="Kept separate from what the bank says"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
        />
        <span className="caption">Saved when you click away.</span>
      </section>

      <section className="card stack" style={{ gap: 10 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Mark as
        </h2>
        <Segmented<TransactionType>
          label="Transaction type"
          block
          disabled={update.isPending}
          value={t.type}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Transfer to self' },
          ]}
          onChange={(type) => update.mutate({ type })}
        />
        {t.transferGroupId ? (
          <span className="caption">Paired with the other leg of this transfer.</span>
        ) : null}
      </section>

      {update.isError ? <Notice kind="error">{errorMessage(update.error)}</Notice> : null}
      {update.isPending ? (
        <span className="caption" role="status">
          Saving…
        </span>
      ) : null}

      {t.source !== 'alert' ? (
        <div className="row">
          <button type="button" className="btn btn--danger" disabled={deleting} onClick={remove}>
            Delete
          </button>
          {deleteError ? <span className="small danger-text">{deleteError}</span> : null}
        </div>
      ) : (
        <p className="caption">Transactions from alerts cannot be deleted. Re-mark them instead.</p>
      )}
    </div>
  );
}

/** Minor units as the plain number a person would type: 4380000 → "43800.00". */
function amountForInput(minor: number): string {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
}

function EditDetails(props: {
  t: Transaction;
  saving: boolean;
  onCancel: () => void;
  onSave: (patch: UpdateTransactionRequest) => void;
}) {
  const { t } = props;
  const [title, setTitle] = useState(t.userTitle ?? '');
  const [amount, setAmount] = useState(amountForInput(t.amountMinor));
  const [when, setWhen] = useState(nowForInput(new Date(t.occurredAt)));
  const [payee, setPayee] = useState(t.counterpartyName ?? '');
  const [problem, setProblem] = useState<string | null>(null);

  function save(e: FormEvent) {
    e.preventDefault();
    const amountMinor = parseMinor(amount);
    if (amountMinor === null || amountMinor <= 0) return setProblem('Enter an amount above zero.');
    if (!when) return setProblem('Choose a date and time.');
    setProblem(null);

    const patch: UpdateTransactionRequest = {};
    if (title.trim() !== (t.userTitle ?? '')) patch.title = title.trim() || null;
    if (amountMinor !== t.amountMinor) patch.amountMinor = amountMinor;
    if (when !== nowForInput(new Date(t.occurredAt))) patch.occurredAt = inputToIso(when);
    if (payee.trim() !== (t.counterpartyName ?? '')) patch.counterpartyName = payee.trim() || null;
    if (Object.keys(patch).length === 0) return props.onCancel();
    props.onSave(patch);
  }

  return (
    <form className="card stack" style={{ gap: 14 }} onSubmit={save} aria-label="Edit details">
      <h2 className="section-title" style={{ margin: 0 }}>
        Edit details
      </h2>
      <div className="field">
        <label htmlFor="tx-title">Title</label>
        <input
          id="tx-title"
          className="input"
          maxLength={200}
          placeholder={t.userTitle ? '' : t.title}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <span className="caption">Leave blank to use the payee or the bank's text.</span>
      </div>
      <div className="grid-2" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="tx-amount">Amount ({t.currency})</label>
          <input
            id="tx-amount"
            className="input mono"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="tx-when">Date and time</label>
          <input
            id="tx-when"
            className="input"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="tx-payee">{t.type === 'income' ? 'From' : 'To'}</label>
        <input
          id="tx-payee"
          className="input"
          maxLength={200}
          placeholder="Payee"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
        />
      </div>
      {t.source === 'alert' ? (
        <span className="caption">
          This came from a bank alert. Change the amount or date only if the alert was wrong.
        </span>
      ) : null}
      {problem ? <Notice kind="error">{problem}</Notice> : null}
      <div className="row">
        <button type="submit" className="btn btn--primary" disabled={props.saving}>
          Save
        </button>
        <button type="button" className="btn" disabled={props.saving} onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
