import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Account, Bank, RawAlert } from '@webspend/shared';
import { BANK_LABELS, TRACKED_BANKS, formatMinor } from '@webspend/shared';
import { api } from '../api/client.ts';
import {
  keys,
  useAccounts,
  useFailedAlerts,
  useInvalidateLedger,
  useUpdateAccount,
} from '../api/hooks.ts';
import { EmptyState, ErrorState, LoadingState, Notice, errorMessage } from '../components/ui.tsx';
import { formatAgo, formatDate, formatDateTime } from '../lib/dates.ts';

const ALL_BANKS: Bank[] = ['grey', 'opay', 'moniepoint', 'gtbank', 'uba', 'other'];

export function Accounts() {
  const accounts = useAccounts();
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-sub">
            The banks WebSpend reads alerts from, and the account numbers that count as yours.
          </p>
        </div>
        <Link to="/import" className="btn">
          Import a statement
        </Link>
      </div>

      {accounts.isPending ? (
        <LoadingState />
      ) : accounts.isError ? (
        <ErrorState error={accounts.error} retry={() => accounts.refetch()} />
      ) : (
        <>
          <section>
            <h2 className="section-title">Tracked banks</h2>
            <div className="bank-grid">
              {TRACKED_BANKS.map((bank) => (
                <BankCard
                  key={bank}
                  bank={bank}
                  account={
                    accounts.data.accounts.find((a) => a.bank === bank && a.tracked) ??
                    accounts.data.accounts.find((a) => a.bank === bank)
                  }
                />
              ))}
            </div>
          </section>
          <MyAccounts accounts={accounts.data.accounts} />
        </>
      )}

      <FailedAlerts />
    </div>
  );
}

function statusOf(a: Account | undefined): { cls: string; label: string } {
  if (!a || !a.tracked || a.status === 'off') return { cls: '', label: 'Off' };
  if (a.status === 'waiting') return { cls: 'status--waiting', label: 'Waiting for first alert' };
  return {
    cls: 'status--tracking',
    label: a.trackingFrom ? `Tracking since ${formatDate(a.trackingFrom)}` : 'Tracking',
  };
}

function BankCard({ bank, account }: { bank: Bank; account: Account | undefined }) {
  const qc = useQueryClient();
  const update = useUpdateAccount();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const s = statusOf(account);
  const on = !!account?.tracked;

  async function toggle() {
    setError(null);
    try {
      let id = account?.id;
      if (!id) {
        // The contract has no "tracked" on create, so make the account first, then switch it on.
        setCreating(true);
        const created = await api.createAccount({ bank, name: BANK_LABELS[bank], isOwn: true });
        id = created.account.id;
        await qc.invalidateQueries({ queryKey: keys.accounts });
      }
      await update.mutateAsync({ id, body: { tracked: !on } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <article className="card bank-card" aria-label={BANK_LABELS[bank]}>
      <div className="bank-card__head">
        <span className="bank-card__name">{BANK_LABELS[bank]}</span>
        <span className={`status ${s.cls}`}>{s.label}</span>
      </div>
      <ol className="checklist">
        <li className={account?.lastAlertAt ? 'done' : ''}>
          Turn on email alerts in the {BANK_LABELS[bank]} app
        </li>
        <li className={on ? 'done' : ''}>Switch tracking on here</li>
      </ol>
      <div className="small">
        {account?.lastBalanceMinor !== null && account?.lastBalanceMinor !== undefined ? (
          <>
            <span className="muted">Last balance </span>
            <span className="mono">{formatMinor(account.lastBalanceMinor, account.currency)}</span>
            {account.lastBalanceAt ? (
              <span className="caption"> · {formatAgo(account.lastBalanceAt)}</span>
            ) : null}
          </>
        ) : on ? (
          <span className="muted">No alerts seen yet. The first one sets the opening balance.</span>
        ) : (
          <span className="muted">Alerts are not being read.</span>
        )}
      </div>
      <div className="row row--between">
        <button
          type="button"
          className={`btn btn--sm${on ? '' : ' btn--primary'}`}
          disabled={update.isPending || creating}
          onClick={toggle}
        >
          {on ? 'Switch tracking off' : 'Switch tracking on'}
        </button>
        {account?.accountNumber ? (
          <span className="caption mono">{account.accountNumber}</span>
        ) : null}
      </div>
      {error ? <Notice kind="error">{error}</Notice> : null}
    </article>
  );
}

function MyAccounts({ accounts }: { accounts: Account[] }) {
  const qc = useQueryClient();
  const own = accounts.filter((a) => a.isOwn && a.bank !== 'cash');
  const [bank, setBank] = useState<Bank>('gtbank');
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: keys.accounts });

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createAccount({
        bank,
        name: name.trim() || BANK_LABELS[bank],
        accountNumber: number.trim() || null,
        isOwn: true,
      });
      setName('');
      setNumber('');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: Account) {
    if (
      !window.confirm(
        `Remove ${a.name}${a.accountNumber ? ` (${a.accountNumber})` : ''} from your accounts?`,
      )
    )
      return;
    setError(null);
    try {
      await api.deleteAccount(a.id);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section>
      <h2 className="section-title">
        <span>My accounts</span>
        <span className="side">Money moving between these is a transfer to self</span>
      </h2>
      <div className="card stack" style={{ gap: 14 }}>
        {own.length === 0 ? (
          <EmptyState>
            No account numbers yet. Add the accounts you own so transfers between them stay out of
            the totals.
          </EmptyState>
        ) : (
          <ul className="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {own.map((a) => (
              <AccountRow key={a.id} account={a} onRemove={() => remove(a)} onError={setError} />
            ))}
          </ul>
        )}
        <form className="inline-form" onSubmit={add} aria-label="Add an account">
          <label className="visually-hidden" htmlFor="acc-bank">
            Bank
          </label>
          <select
            id="acc-bank"
            className="select"
            value={bank}
            onChange={(e) => setBank(e.target.value as Bank)}
          >
            {ALL_BANKS.map((b) => (
              <option key={b} value={b}>
                {BANK_LABELS[b]}
              </option>
            ))}
          </select>
          <label className="visually-hidden" htmlFor="acc-name">
            Name
          </label>
          <input
            id="acc-name"
            className="input"
            placeholder="Name, e.g. GTBank savings"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="visually-hidden" htmlFor="acc-number">
            Account number
          </label>
          <input
            id="acc-number"
            className="input mono"
            placeholder="Account number"
            inputMode="numeric"
            maxLength={40}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <button type="submit" className="btn" disabled={busy}>
            Add
          </button>
        </form>
        {error ? <Notice kind="error">{error}</Notice> : null}
      </div>
    </section>
  );
}

function AccountRow(props: {
  account: Account;
  onRemove: () => void;
  onError: (message: string | null) => void;
}) {
  const a = props.account;
  const invalidate = useInvalidateLedger();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(a.name);
  const [number, setNumber] = useState(a.accountNumber ?? '');
  const [busy, setBusy] = useState(false);

  function startEditing() {
    setName(a.name);
    setNumber(a.accountNumber ?? '');
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    props.onError(null);
    try {
      await api.updateAccount(a.id, { name: name.trim(), accountNumber: number.trim() || null });
      await invalidate();
      setEditing(false);
    } catch (err) {
      props.onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="list-item">
        <form className="inline-form" style={{ flex: 1 }} onSubmit={save} aria-label="Edit account">
          <label className="visually-hidden" htmlFor={`acc-name-${a.id}`}>
            Name
          </label>
          <input
            id={`acc-name-${a.id}`}
            className="input"
            maxLength={60}
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="visually-hidden" htmlFor={`acc-number-${a.id}`}>
            Account number
          </label>
          <input
            id={`acc-number-${a.id}`}
            className="input mono"
            placeholder="Account number"
            inputMode="numeric"
            maxLength={40}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            Save
          </button>
          <button
            type="button"
            className="btn btn--sm"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className="list-item">
      <span className="list-item__text">
        <span style={{ fontWeight: 500 }}>{a.name}</span>
        <span className="caption">
          {BANK_LABELS[a.bank]}
          {a.accountNumber ? (
            <>
              {' '}
              · <span className="mono">{a.accountNumber}</span>
            </>
          ) : null}
          {a.tracked ? ' · tracked' : ''}
        </span>
      </span>
      <span className="list-item__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={startEditing}>
          Edit
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm btn--danger"
          onClick={props.onRemove}
        >
          Remove
        </button>
      </span>
    </li>
  );
}

const ALERT_STATUS: Record<RawAlert['status'], string> = {
  parsed: 'Parsed',
  unknown_sender: 'Unknown sender',
  not_a_transaction: 'Not a transaction',
  unrecognised_layout: 'Unrecognised layout',
  before_tracking_from: 'Before tracking started',
  failed_authentication: 'Failed sender check',
  duplicate: 'Duplicate',
};

function FailedAlerts() {
  const [open, setOpen] = useState(false);
  const alerts = useFailedAlerts(open);
  return (
    <section>
      <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary
          className="section-title"
          style={{ cursor: 'pointer', display: 'inline-flex', gap: 8 }}
        >
          Alerts that could not be read
        </summary>
        <div className="card" style={{ marginTop: 10 }}>
          {!open ? null : alerts.isPending ? (
            <LoadingState />
          ) : alerts.isError ? (
            <ErrorState error={alerts.error} retry={() => alerts.refetch()} />
          ) : alerts.data.alerts.length === 0 ? (
            <EmptyState>
              Every alert so far was read. Ones that cannot be are kept here for a parser fix.
            </EmptyState>
          ) : (
            <ul className="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {alerts.data.alerts.map((a) => (
                <li key={a.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                  <span className="list-item__text">
                    <span style={{ fontWeight: 500 }}>{a.subject || '(no subject)'}</span>
                    <span className="caption">
                      {a.sender} · {formatDateTime(a.receivedAt)}
                    </span>
                    {a.detail ? <span className="small muted">{a.detail}</span> : null}
                  </span>
                  <span className="status">{ALERT_STATUS[a.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </section>
  );
}
