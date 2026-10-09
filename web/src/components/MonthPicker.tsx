import { useEffect, useRef, useState } from 'react';
import { currentMonth, formatMonthTitle, shiftMonth } from '../lib/dates.ts';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

type Props = {
  /** `YYYY-MM`, or null when no month is chosen (the arrows then step from the current month). */
  month: string | null;
  onChange: (month: string) => void;
  /** The smaller form used in toolbars. */
  compact?: boolean;
  emptyLabel?: string;
};

/**
 * Previous and next arrows around the month's name; the name opens a grid of months for jumping
 * straight to any of them. Months after the current one cannot be reached either way.
 */
export function MonthPicker({
  month,
  onChange,
  compact = false,
  emptyLabel = 'All months',
}: Props) {
  const latest = currentMonth();
  const shown = month ?? latest;
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(shown.slice(0, 4)));
  const root = useRef<HTMLDivElement>(null);
  const latestYear = Number(latest.slice(0, 4));

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    setYear(Number(shown.slice(0, 4)));
    setOpen((was) => !was);
  };
  const pick = (value: string) => {
    onChange(value);
    setOpen(false);
  };
  const arrow = compact ? 'btn btn--sm month-picker__arrow' : 'btn btn--round';

  return (
    <div className={`month-picker${compact ? ' month-picker--compact' : ''}`} ref={root}>
      <button
        type="button"
        className={arrow}
        aria-label="Previous month"
        onClick={() => onChange(shiftMonth(shown, -1))}
      >
        ‹
      </button>
      <button
        type="button"
        className="month-picker__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        {compact ? (
          <span>{month ? formatMonthTitle(month) : emptyLabel}</span>
        ) : (
          <h1 className="page-title">{formatMonthTitle(shown)}</h1>
        )}
        <svg className="month-picker__caret" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        className={arrow}
        aria-label="Next month"
        disabled={shown >= latest}
        onClick={() => onChange(shiftMonth(shown, 1))}
      >
        ›
      </button>

      {open ? (
        <div className="month-picker__panel" role="dialog" aria-label="Choose a month">
          <div className="month-picker__year">
            <button
              type="button"
              className="btn btn--sm month-picker__arrow"
              aria-label="Previous year"
              onClick={() => setYear(year - 1)}
            >
              ‹
            </button>
            <span className="mono">{year}</span>
            <button
              type="button"
              className="btn btn--sm month-picker__arrow"
              aria-label="Next year"
              disabled={year >= latestYear}
              onClick={() => setYear(year + 1)}
            >
              ›
            </button>
          </div>
          <div className="month-picker__grid">
            {MONTH_NAMES.map((name, index) => {
              const value = `${year}-${String(index + 1).padStart(2, '0')}`;
              return (
                <button
                  key={value}
                  type="button"
                  className={`month-picker__month${value === latest ? ' is-current' : ''}`}
                  aria-pressed={value === month}
                  disabled={value > latest}
                  onClick={() => pick(value)}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => pick(latest)}>
            This month
          </button>
        </div>
      ) : null}
    </div>
  );
}
