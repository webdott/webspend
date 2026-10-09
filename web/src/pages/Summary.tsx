import { Link, useSearchParams } from 'react-router-dom';
import { formatApprox, formatMinor, formatRate, formatSigned } from '@webspend/shared';
import { useSummary, useTransactions } from '../api/hooks.ts';
import { showsUsd, useUser } from '../components/user.ts';
import { CategoryLabel } from '../components/TransactionRow.tsx';
import { Amount, EmptyState, ErrorState, LoadingState } from '../components/ui.tsx';
import {
  currentMonth,
  formatMonthTitle,
  formatShortDate,
  isValidMonth,
  shiftMonth,
} from '../lib/dates.ts';

export function Summary() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const month = isValidMonth(params.get('month')) ? params.get('month')! : currentMonth();
  const summary = useSummary(month);
  const latest = useTransactions({ month, limit: 6 });
  const showUsd = showsUsd(user);

  const go = (m: string) => setParams(m === currentMonth() ? {} : { month: m });

  return (
    <div className="stack">
      <div className="page-head">
        <div className="month-nav">
          <button
            type="button"
            className="btn btn--round"
            aria-label="Previous month"
            onClick={() => go(shiftMonth(month, -1))}
          >
            ‹
          </button>
          <h1 className="page-title">{formatMonthTitle(month)}</h1>
          <button
            type="button"
            className="btn btn--round"
            aria-label="Next month"
            onClick={() => go(shiftMonth(month, 1))}
          >
            ›
          </button>
        </div>
        {summary.data ? (
          <div className="row row--wrap">
            {summary.data.uncategorisedCount > 0 ? (
              <Link to={`/transactions?filter=uncategorised&month=${month}`} className="badge">
                <span className="count">{summary.data.uncategorisedCount}</span>
                need a category
              </Link>
            ) : null}
            {summary.data.openGapCount > 0 ? (
              <Link to="/accounts#gaps" className="badge">
                <span className="count">{summary.data.openGapCount}</span>
                {summary.data.openGapCount === 1 ? 'gap to fill' : 'gaps to fill'}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {summary.isPending ? (
        <LoadingState />
      ) : summary.isError ? (
        <ErrorState error={summary.error} retry={() => summary.refetch()} />
      ) : (
        <>
          <Hero s={summary.data} showUsd={showUsd} />
          <div className="grid-2">
            <section>
              <h2 className="section-title">Where it went</h2>
              <div className="card">
                {summary.data.byCategory.length === 0 ? (
                  <EmptyState>
                    Nothing spent this month yet. Expenses show up here by category.
                  </EmptyState>
                ) : (
                  <WhereItWent s={summary.data} showUsd={showUsd} month={month} />
                )}
              </div>
            </section>
            <section>
              <h2 className="section-title">
                <span>Latest transactions</span>
                <span className="row" style={{ gap: 14 }}>
                  {showUsd && summary.data.todayPerUsd ? (
                    <span className="side accent-text mono">
                      {formatRate(summary.data.todayPerUsd, summary.data.currency)}
                    </span>
                  ) : null}
                  <Link to={`/transactions?month=${month}`}>All transactions</Link>
                </span>
              </h2>
              <div className="card card--flush">
                {latest.isPending ? (
                  <LoadingState />
                ) : latest.isError ? (
                  <ErrorState error={latest.error} retry={() => latest.refetch()} />
                ) : latest.data.pages[0]?.transactions.length === 0 ? (
                  <EmptyState>
                    No transactions in {formatMonthTitle(month)}. They appear here as alerts arrive.
                  </EmptyState>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="hide-sm">Date</th>
                        <th>Transaction</th>
                        <th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latest.data.pages[0]?.transactions.map((t) => (
                        <tr key={t.id}>
                          <td className="hide-sm muted" style={{ whiteSpace: 'nowrap' }}>
                            {formatShortDate(t.occurredAt)}
                          </td>
                          <td>
                            <Link to={`/transactions/${t.id}`} className="rowlink">
                              {t.title}
                            </Link>
                            <span className="sub">
                              <CategoryLabel t={t} /> · {t.accountName}
                            </span>
                          </td>
                          <td className="num">
                            <Amount
                              minor={t.amountMinor}
                              currency={t.currency}
                              type={t.type}
                              usdMinor={t.usdMinor}
                              showUsd={showUsd}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

type S = NonNullable<ReturnType<typeof useSummary>['data']>;

function Hero({ s, showUsd }: { s: S; showUsd: boolean }) {
  const hasBudget = s.budgetMinor !== null && s.leftMinor !== null;
  const progress =
    hasBudget && s.budgetMinor! > 0
      ? Math.min(100, Math.max(0, (s.spentMinor / s.budgetMinor!) * 100))
      : 0;
  return (
    <section className="hero" aria-label="This month">
      {hasBudget ? (
        <>
          <div className="hero__label">Left to spend</div>
          <div className="hero__amount">{formatMinor(s.leftMinor!, s.currency)}</div>
          <div className="hero__sub">
            {showUsd && s.leftUsdMinor !== null ? `${formatApprox(s.leftUsdMinor, 'USD')} · ` : ''}
            of {formatMinor(s.budgetMinor!, s.currency)} budget
          </div>
          <div
            className="hero__progress"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Budget used"
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        </>
      ) : (
        <>
          <div className="hero__label">Spent this month</div>
          <div className="hero__amount">{formatMinor(s.spentMinor, s.currency)}</div>
          <div className="hero__sub">
            {showUsd && s.spentUsdMinor !== null
              ? `${formatApprox(s.spentUsdMinor, 'USD')} · `
              : ''}
            <Link to="/settings" style={{ color: 'inherit', textDecoration: 'underline' }}>
              Set a monthly budget
            </Link>{' '}
            to see what is left
          </div>
          <div className="hero__progress" aria-hidden="true" />
        </>
      )}
      <div className="hero__cols">
        <div>
          <div className="hero__label">Spent</div>
          <div className="hero__amount">{formatMinor(s.spentMinor, s.currency)}</div>
          {showUsd && s.spentUsdMinor !== null ? (
            <div className="hero__sub">{formatApprox(s.spentUsdMinor, 'USD')}</div>
          ) : null}
        </div>
        <div>
          <div className="hero__label">Income</div>
          <div className="hero__amount">
            {formatSigned(s.incomeMinor, s.currency, s.incomeMinor > 0 ? 'income' : 'transfer')}
          </div>
          {showUsd && s.incomeUsdMinor !== null ? (
            <div className="hero__sub">{formatApprox(s.incomeUsdMinor, 'USD')}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function WhereItWent({ s, showUsd, month }: { s: S; showUsd: boolean; month: string }) {
  const max = Math.max(...s.byCategory.map((c) => c.minor), 1);
  return (
    <div className="cat-list">
      {s.byCategory.map((c) => (
        <div className="cat-row" key={c.categoryId ?? 'none'}>
          <span className="cat-row__name">
            {c.categoryId === null ? (
              <Link
                to={`/transactions?filter=uncategorised&month=${month}`}
                className="accent-text"
              >
                {c.name}
              </Link>
            ) : (
              <Link
                to={`/transactions?categoryId=${c.categoryId}&month=${month}`}
                style={{ color: 'inherit' }}
              >
                {c.name}
              </Link>
            )}
            <span className="caption" style={{ marginLeft: 8 }}>
              {c.count === 1 ? '1 item' : `${c.count} items`}
            </span>
          </span>
          <span className="cat-row__amount">
            <span className="mono">{formatMinor(c.minor, s.currency)}</span>
            {showUsd && c.usdMinor !== null ? (
              <span className="caption" style={{ display: 'block' }}>
                {formatApprox(c.usdMinor, 'USD')}
              </span>
            ) : null}
          </span>
          <span className="cat-row__bar" aria-hidden="true">
            <span style={{ width: `${(c.minor / max) * 100}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}
