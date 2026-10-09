import { Link, useSearchParams } from 'react-router-dom';
import { formatApprox, formatMinor, formatRate, formatSigned } from '@webspend/shared';
import { useSummary, useTransactions } from '../api/hooks.ts';
import { showsUsd, useUser } from '../components/user.ts';
import { MonthPicker } from '../components/MonthPicker.tsx';
import { CategoryLabel } from '../components/TransactionRow.tsx';
import { Amount, EmptyState, ErrorState, LoadingState } from '../components/ui.tsx';
import {
  currentMonth,
  formatMonthName,
  formatMonthTitle,
  formatShortDate,
  isValidMonth,
  shiftMonth,
} from '../lib/dates.ts';

export function Summary() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const asked = params.get('month');
  const month = isValidMonth(asked) && asked <= currentMonth() ? asked : currentMonth();
  const summary = useSummary(month);
  const latest = useTransactions({ month, limit: 6 });
  const showUsd = showsUsd(user);

  const go = (m: string) => setParams(m === currentMonth() ? {} : { month: m });

  return (
    <div className="stack">
      <div className="page-head">
        <MonthPicker month={month} onChange={go} />
        {summary.data ? (
          <div className="row row--wrap">
            {summary.data.uncategorisedCount > 0 ? (
              <Link to={`/transactions?filter=uncategorised&month=${month}`} className="badge">
                <span className="count">{summary.data.uncategorisedCount}</span>
                need a category
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
          <Hero s={summary.data} showUsd={showUsd} month={month} />
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

function Hero({ s, showUsd, month }: { s: S; showUsd: boolean; month: string }) {
  const hasBudget = s.budgetMinor !== null && s.leftMinor !== null;
  const had = s.carryOverMinor + s.incomeMinor;
  const base = hasBudget ? s.budgetMinor! : had;
  const progress = base > 0 ? Math.min(100, Math.max(0, (s.spentMinor / base) * 100)) : 0;
  const net = s.incomeMinor - s.spentMinor;
  const usd = (minor: number | null) =>
    showUsd && minor !== null ? formatApprox(minor, 'USD') : null;
  const headlineUsd = usd(hasBudget ? s.leftUsdMinor : s.availableUsdMinor);
  const previous = formatMonthName(shiftMonth(month, -1));

  return (
    <section className="hero" aria-label="This month">
      <div className="hero__top">
        <div>
          <div className="hero__label">{hasBudget ? 'Left to spend' : 'Available'}</div>
          <div className="hero__amount">
            {formatMinor(hasBudget ? s.leftMinor! : s.availableMinor, s.currency)}
          </div>
          <div className="hero__sub">
            {headlineUsd ? `${headlineUsd} · ` : ''}
            {hasBudget ? (
              <>
                of {formatMinor(s.budgetMinor!, s.currency)} budget ·{' '}
                {formatMinor(s.availableMinor, s.currency)} available
              </>
            ) : (
              <>
                carried over plus income, less spending · <Link to="/settings">Set a budget</Link>
              </>
            )}
          </div>
        </div>
        <div className={`hero__net${net < 0 ? ' hero__net--down' : ''}`}>
          <HeroIcon name={net < 0 ? 'down' : 'up'} />
          <span className="mono">
            {formatSigned(net, s.currency, net < 0 ? 'expense' : 'income')}
          </span>
          <span>this month</span>
        </div>
      </div>

      <div className="hero__meter">
        <div
          className="hero__progress"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={hasBudget ? 'Budget used' : 'Share of your money spent'}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className="hero__meter-label mono">
          {base > 0
            ? `${Math.round(progress)}% ${hasBudget ? 'of budget' : ''} spent`
            : 'No income yet'}
        </span>
      </div>

      <div className="hero__tiles">
        <HeroTile
          icon="carry"
          label={`Carried over from ${previous}`}
          amount={formatMinor(s.carryOverMinor, s.currency)}
          sub={usd(s.carryOverUsdMinor)}
        />
        <HeroTile
          icon="in"
          label="Income"
          amount={formatSigned(
            s.incomeMinor,
            s.currency,
            s.incomeMinor > 0 ? 'income' : 'transfer',
          )}
          sub={usd(s.incomeUsdMinor)}
        />
        <HeroTile
          icon="out"
          label="Spent"
          amount={formatMinor(s.spentMinor, s.currency)}
          sub={usd(s.spentUsdMinor)}
        />
      </div>
    </section>
  );
}

type HeroIconName = 'carry' | 'in' | 'out' | 'up' | 'down';

const HERO_ICON_PATHS: Record<HeroIconName, string> = {
  carry: 'M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5',
  in: 'M17 7 7 17M7 9v8h8',
  out: 'M7 17 17 7M9 7h8v8',
  up: 'M4 16l5-5 4 4 7-8M15 7h5v5',
  down: 'M4 8l5 5 4-4 7 8M15 17h5v-5',
};

function HeroIcon({ name }: { name: HeroIconName }) {
  return (
    <svg className="hero__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={HERO_ICON_PATHS[name]} />
    </svg>
  );
}

function HeroTile(props: {
  icon: HeroIconName;
  label: string;
  amount: string;
  sub: string | null;
}) {
  return (
    <div className={`hero__tile hero__tile--${props.icon}`}>
      <span className="hero__chip">
        <HeroIcon name={props.icon} />
      </span>
      <div className="hero__tile-text">
        <div className="hero__label">{props.label}</div>
        <div className="hero__tile-amount">{props.amount}</div>
        {props.sub ? <div className="hero__sub">{props.sub}</div> : null}
      </div>
    </div>
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
