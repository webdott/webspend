import type { ReactNode } from 'react';
import type { Currency, TransactionType } from '@webspend/shared';
import { formatApprox, formatSigned } from '@webspend/shared';
import { isApiError } from '../api/client.ts';

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />{' '}
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="state">{children}</div>;
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <div>{errorMessage(error)}</div>
      {retry ? (
        <button type="button" className="btn btn--sm" style={{ marginTop: 12 }} onClick={retry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error) {
    return /fetch/i.test(error.message)
      ? 'Could not reach the server. Check your connection and try again.'
      : error.message;
  }
  return 'Something went wrong.';
}

export function Notice({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'error' | 'ok';
  children: ReactNode;
}) {
  return (
    <div
      className={`notice${kind === 'error' ? ' notice--error' : kind === 'ok' ? ' notice--ok' : ''}`}
      role={kind === 'error' ? 'alert' : undefined}
    >
      {children}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  block,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  block?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`segmented${block ? ' segmented--block' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Amount({
  minor,
  currency,
  type,
  usdMinor,
  showUsd,
  className = '',
}: {
  minor: number;
  currency: Currency;
  type: TransactionType;
  usdMinor: number | null;
  showUsd: boolean;
  className?: string;
}) {
  return (
    <span
      className={`${className} ${type === 'transfer' ? 'tx-row__amount--transfer' : ''}`.trim()}
    >
      <span className="mono">{formatSigned(minor, currency, type)}</span>
      {showUsd && currency !== 'USD' ? (
        <span className="caption">{formatApprox(usdMinor, 'USD') ?? ' '}</span>
      ) : null}
    </span>
  );
}

export function RowIcon({ title, type }: { title: string; type: TransactionType }) {
  const cls =
    type === 'income'
      ? ' tx-row__icon--income'
      : type === 'transfer'
        ? ' tx-row__icon--transfer'
        : '';
  return (
    <span className={`tx-row__icon${cls}`} aria-hidden="true">
      {type === 'transfer' ? '⇄' : (title.trim()[0] ?? '•').toUpperCase()}
    </span>
  );
}

export function sourceLabel(source: 'alert' | 'import' | 'manual'): string {
  return source === 'alert'
    ? 'from email alert'
    : source === 'import'
      ? 'imported'
      : 'entered by hand';
}
