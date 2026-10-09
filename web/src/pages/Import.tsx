import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  DateOrder,
  ImportCommitResponse,
  ImportField,
  ImportFormat,
  ImportMapping,
  ImportPreviewResponse,
} from '@webspend/shared';
import { BANK_LABELS, IMPORT_FIELDS, formatMinor } from '@webspend/shared';
import { api } from '../api/client.ts';
import { useAccounts, useGaps, useInvalidateLedger } from '../api/hooks.ts';
import { ErrorState, LoadingState, Notice, Segmented, errorMessage } from '../components/ui.tsx';
import { formatDate } from '../lib/dates.ts';
import { DATE_ORDER_LABELS, IMPORT_FIELD_LABELS, mappingProblems } from '../lib/importMapping.ts';

export function Import() {
  const [params] = useSearchParams();
  const gapId = params.get('gapId');
  const accounts = useAccounts();
  const gaps = useGaps();
  const invalidate = useInvalidateLedger();
  const gap = gapId ? gaps.data?.gaps.find((g) => g.id === gapId) : undefined;

  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<{ name: string; format: ImportFormat; content: string } | null>(
    null,
  );
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportCommitResponse | null>(null);

  useEffect(() => {
    if (accountId || !accounts.data) return;
    const list = accounts.data.accounts;
    const first = gap
      ? gap.accountId
      : ((list.find((a) => a.tracked && a.bank !== 'grey') ?? list.find((a) => a.bank !== 'cash'))
          ?.id ?? '');
    if (first) setAccountId(first);
  }, [accounts.data, gap, accountId]);

  async function onFile(f: File | undefined) {
    setPreview(null);
    setMapping(null);
    setResult(null);
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    const content = await f.text();
    const format: ImportFormat =
      /\.json$/i.test(f.name) || content.trim().startsWith('[') || content.trim().startsWith('{')
        ? 'json'
        : 'csv';
    setFile({ name: f.name, format, content });
  }

  async function runPreview() {
    if (!file || !accountId) return;
    setBusy('preview');
    setError(null);
    try {
      const res = await api.importPreview({
        accountId,
        format: file.format,
        content: file.content,
      });
      setPreview(res);
      setMapping(res.suggestedMapping);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (file && accountId && !preview && busy === null && !error) void runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, accountId]);

  async function commit() {
    if (!file || !mapping) return;
    setBusy('commit');
    setError(null);
    try {
      const res = await api.importCommit({
        accountId,
        format: file.format,
        content: file.content,
        mapping,
        gapId: gapId ?? null,
      });
      setResult(res);
      await invalidate();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const problems = mapping ? mappingProblems(mapping) : [];
  const setColumn = (col: string, field: ImportField) =>
    setMapping((m) => (m ? { ...m, columns: { ...m.columns, [col]: field } } : m));
  const usesAmount = mapping ? Object.values(mapping.columns).includes('amount') : false;

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div>
        <h1 className="page-title">Import a statement</h1>
        <p className="page-sub">
          CSV or JSON from your bank. Rows that match a transaction already logged are skipped.
        </p>
      </div>

      {gap ? (
        <Notice>
          Filling the gap on <strong>{gap.accountName}</strong> between {formatDate(gap.fromAt)} and{' '}
          {formatDate(gap.toAt)}:{' '}
          <span className="mono">{formatMinor(gap.differenceMinor, gap.currency)}</span> unaccounted
          for.
        </Notice>
      ) : null}

      <section className="card stack" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="imp-account">Account</label>
          {accounts.isPending ? (
            <LoadingState />
          ) : accounts.isError ? (
            <ErrorState error={accounts.error} retry={() => accounts.refetch()} />
          ) : (
            <select
              id="imp-account"
              className="select"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setPreview(null);
                setResult(null);
              }}
            >
              {accounts.data.accounts.length === 0 ? (
                <option value="">No accounts yet</option>
              ) : null}
              {accounts.data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {BANK_LABELS[a.bank]}
                  {a.accountNumber ? ` · ${a.accountNumber}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        <div
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFile(e.dataTransfer.files[0]);
          }}
        >
          {file ? (
            <strong style={{ color: 'var(--ink)' }}>{file.name}</strong>
          ) : (
            'Drop a CSV or JSON file here, or choose one'
          )}
          <label>
            <span className="visually-hidden">Statement file</span>
            <input
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
        </div>
      </section>

      {busy === 'preview' ? <LoadingState label="Reading the file" /> : null}
      {error ? (
        <div className="row">
          <Notice kind="error">{error}</Notice>
          {!preview && file ? (
            <button type="button" className="btn btn--sm" onClick={runPreview}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {preview && mapping && !result ? (
        <>
          <section className="card stack" style={{ gap: 14 }}>
            <h2 className="section-title" style={{ margin: 0 }}>
              <span>Columns</span>
              <span className="side">
                {preview.rowCount} {preview.rowCount === 1 ? 'row' : 'rows'}
              </span>
            </h2>
            <div className="mapping">
              {preview.columns.map((col) => (
                <label key={col}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{col}</span>
                  <select
                    className="select"
                    value={mapping.columns[col] ?? 'ignore'}
                    onChange={(e) => setColumn(col, e.target.value as ImportField)}
                  >
                    {IMPORT_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {IMPORT_FIELD_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {usesAmount ? (
              <div className="field">
                <span className="label">In the amount column</span>
                <Segmented<'neg' | 'pos'>
                  label="Sign convention"
                  value={mapping.negativeIsExpense ? 'neg' : 'pos'}
                  options={[
                    { value: 'neg', label: 'Negative is money out' },
                    { value: 'pos', label: 'Positive is money out' },
                  ]}
                  onChange={(v) => setMapping({ ...mapping, negativeIsExpense: v === 'neg' })}
                />
              </div>
            ) : null}
            {preview.dateAmbiguous ? (
              <div className="field">
                <span className="label">
                  Some dates could be read either way. Which comes first?
                </span>
                <Segmented<DateOrder>
                  label="Date order"
                  value={mapping.dateOrder}
                  options={(['dmy', 'mdy', 'ymd'] as DateOrder[]).map((v) => ({
                    value: v,
                    label: DATE_ORDER_LABELS[v],
                  }))}
                  onChange={(dateOrder) => setMapping({ ...mapping, dateOrder })}
                />
              </div>
            ) : null}
            {problems.length > 0 ? <Notice kind="error">{problems.join(' ')}</Notice> : null}
          </section>

          <section className="card card--flush">
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    {preview.columns.map((c) => (
                      <th key={c}>
                        {c}
                        {mapping.columns[c] && mapping.columns[c] !== 'ignore' ? (
                          <span className="accent-text" style={{ marginLeft: 6 }}>
                            → {IMPORT_FIELD_LABELS[mapping.columns[c]!]}
                          </span>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.map((r, i) => (
                    <tr key={i}>
                      {preview.columns.map((c) => (
                        <td key={c} style={{ whiteSpace: 'nowrap' }}>
                          {r[c] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy !== null || problems.length > 0}
              onClick={commit}
            >
              {busy === 'commit'
                ? 'Importing…'
                : `Import ${preview.rowCount} ${preview.rowCount === 1 ? 'row' : 'rows'}`}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => onFile(undefined)}>
              Start over
            </button>
          </div>
        </>
      ) : null}

      {result ? (
        <section className="card stack" style={{ gap: 10 }}>
          <Notice kind="ok">
            Added {result.added} · Skipped {result.skipped}
          </Notice>
          {result.errors.length > 0 ? (
            <div>
              <strong className="small">
                {result.errors.length} {result.errors.length === 1 ? 'row' : 'rows'} could not be
                read
              </strong>
              <ul className="small muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {result.errors.slice(0, 20).map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.reason}
                  </li>
                ))}
                {result.errors.length > 20 ? <li>…and {result.errors.length - 20} more</li> : null}
              </ul>
            </div>
          ) : null}
          <div className="row">
            <Link to="/transactions" className="btn">
              See transactions
            </Link>
            <button type="button" className="btn btn--ghost" onClick={() => onFile(undefined)}>
              Import another
            </button>
            {gapId ? (
              <Link to="/accounts" className="small" style={{ marginLeft: 'auto' }}>
                Back to accounts
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
