import { useEffect, useState, type FormEvent } from 'react';
import type { ExportFormat, TransactionType } from '@webspend/shared';
import { BANK_LABELS } from '@webspend/shared';
import { api } from '../api/client.ts';
import { useAccounts } from '../api/hooks.ts';
import { currentMonth, dayOf, shiftMonth } from '../lib/dates.ts';
import { monthBounds, rangeProblem, yearBounds, type DayRange } from '../lib/export.ts';
import { Notice, Segmented, errorMessage } from './ui.tsx';

type TypeFilter = 'all' | TransactionType;

export function ExportButton({
  month,
  accountId,
  className = '',
}: {
  /** The month the page is showing, which the dialog starts from. */
  month?: string | null;
  accountId?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`btn btn--ghost ${className}`.trim()}
        onClick={() => setOpen(true)}
      >
        Export
      </button>
      {open ? (
        <ExportDialog
          month={month ?? null}
          accountId={accountId ?? null}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** Picks a format and a range of days, then downloads the file the server builds. */
export function ExportDialog({
  month,
  accountId: initialAccount,
  onClose,
}: {
  month: string | null;
  accountId: string | null;
  onClose: () => void;
}) {
  const accounts = useAccounts();
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [range, setRange] = useState<DayRange>(() => monthBounds(month ?? currentMonth()));
  const [accountId, setAccountId] = useState(initialAccount ?? '');
  const [type, setType] = useState<TypeFilter>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const today = dayOf(new Date());
  const problem = rangeProblem(range);
  const presets: { label: string; range: DayRange }[] = [
    { label: 'This month', range: monthBounds(currentMonth()) },
    { label: 'Last month', range: monthBounds(shiftMonth(currentMonth(), -1)) },
    { label: 'This year', range: yearBounds() },
  ];
  const isPreset = (p: DayRange) => p.from === range.from && p.to === range.to;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const file = await api.exportFile({
        format,
        from: range.from,
        to: range.to,
        accountId: accountId || undefined,
        type: type === 'all' ? undefined : type,
      });
      const link = document.createElement('a');
      link.href = file.url;
      link.download = file.filename;
      document.body.append(link);
      link.click();
      link.remove();
      file.release?.();
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
        aria-labelledby="export-title"
        onSubmit={submit}
      >
        <div className="row row--between">
          <h2 id="export-title" className="section-title" style={{ margin: 0 }}>
            Export transactions
          </h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="caption" style={{ margin: 0 }}>
          A spreadsheet-ready CSV, or a PDF statement with totals. Transfers to self are listed but
          not counted.
        </p>

        <div className="field">
          <span>Format</span>
          <Segmented
            label="Format"
            block
            value={format}
            options={[
              { value: 'csv', label: 'CSV' },
              { value: 'pdf', label: 'PDF' },
            ]}
            onChange={setFormat}
          />
        </div>

        <div className="field">
          <span>Days to include</span>
          <div className="pills" role="group" aria-label="Quick ranges">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                className="pill"
                aria-pressed={isPreset(p.range)}
                onClick={() => setRange(p.range)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid-2" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="export-from">From</label>
            <input
              id="export-from"
              className="input"
              type="date"
              required
              max={range.to || today}
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="export-to">To</label>
            <input
              id="export-to"
              className="input"
              type="date"
              required
              min={range.from || undefined}
              max={today}
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="export-account">Account</label>
            <select
              id="export-account"
              className="select"
              value={accountId}
              disabled={accounts.isPending}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">All accounts</option>
              {accounts.data?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.name === BANK_LABELS[a.bank] ? '' : ` · ${BANK_LABELS[a.bank]}`}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="export-type">Include</label>
            <select
              id="export-type"
              className="select"
              value={type}
              onChange={(e) => setType(e.target.value as TypeFilter)}
            >
              <option value="all">Everything</option>
              <option value="expense">Expenses only</option>
              <option value="income">Income only</option>
              <option value="transfer">Transfers to self only</option>
            </select>
          </div>
        </div>
        {error ? <Notice kind="error">{error}</Notice> : null}
        {!error && problem ? <p className="caption">{problem}</p> : null}
        <div className="row">
          <button type="submit" className="btn btn--primary" disabled={busy || !!problem}>
            {busy ? 'Preparing…' : `Download ${format.toUpperCase()}`}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
