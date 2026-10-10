import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Currency, Theme } from '@webspend/shared';
import { CURRENCIES, CURRENCY_NAMES, formatMinor, formatRate, parseMinor } from '@webspend/shared';
import { api } from '../api/client.ts';
import { useCategories, useRates, useUpdateSettings } from '../api/hooks.ts';
import { Notice, Segmented, Switch, errorMessage } from '../components/ui.tsx';
import { useUser } from '../components/user.ts';
import { applyTheme } from '../theme.ts';

export function Settings() {
  const user = useUser();
  const update = useUpdateSettings();
  const rates = useRates();
  const categories = useCategories();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [budget, setBudget] = useState(
    user.monthlyBudgetMinor === null
      ? ''
      : (user.monthlyBudgetMinor / 100).toLocaleString('en-GB', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }),
  );
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    setBudget(
      user.monthlyBudgetMinor === null
        ? ''
        : (user.monthlyBudgetMinor / 100).toLocaleString('en-GB', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          }),
    );
  }, [user.monthlyBudgetMinor]);

  const rate = rates.data?.rates.find((r) => r.currency === user.defaultCurrency);
  const usdDefault = user.defaultCurrency === 'USD';

  const budgetChanged =
    budget.trim() === ''
      ? user.monthlyBudgetMinor !== null
      : parseMinor(budget.trim()) !== user.monthlyBudgetMinor;
  function saveBudget() {
    const trimmed = budget.trim();
    if (trimmed === '') {
      setBudgetError(null);
      if (user.monthlyBudgetMinor !== null) update.mutate({ monthlyBudgetMinor: null });
      return;
    }
    const minor = parseMinor(trimmed);
    if (minor === null || minor < 0) {
      setBudgetError('Enter an amount like 1,200,000.');
      return;
    }
    setBudgetError(null);
    if (minor !== user.monthlyBudgetMinor) update.mutate({ monthlyBudgetMinor: minor });
  }

  async function signOut() {
    setSignOutError(null);
    try {
      await api.logout();
      qc.clear();
      applyTheme(null);
      navigate('/signin', { replace: true });
    } catch (err) {
      setSignOutError(errorMessage(err));
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <h1 className="page-title">Settings</h1>

      <section className="card stack" style={{ gap: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Default currency
        </h2>
        <div className="choice-grid" role="group" aria-label="Default currency">
          {CURRENCIES.map((c: Currency) => (
            <button
              key={c}
              type="button"
              className="choice"
              aria-pressed={user.defaultCurrency === c}
              disabled={update.isPending}
              onClick={() => update.mutate({ defaultCurrency: c })}
            >
              <span className="choice__code">{c}</span>
              <span className="choice__name">{CURRENCY_NAMES[c]}</span>
            </button>
          ))}
        </div>
        <p className="caption" style={{ margin: 0 }}>
          Totals and the budget are shown in this currency. Each transaction keeps the rate from its
          own day.
        </p>
      </section>

      <section className="card">
        {usdDefault ? (
          <div className="switch-row">
            <div className="switch-row__text">
              <span>US dollar equivalent</span>
              <span className="caption">No conversion needed</span>
            </div>
          </div>
        ) : (
          <div className="switch-row">
            <div className="switch-row__text">
              <span>Show US dollar equivalent</span>
              <span className="caption">
                {rates.isPending
                  ? 'Fetching today’s rate…'
                  : rate
                    ? `Today’s rate ${formatRate(rate.perUsd, user.defaultCurrency)}`
                    : 'No rate for today yet'}
              </span>
            </div>
            <Switch
              label="Show US dollar equivalent"
              checked={user.showUsdEquivalent}
              disabled={update.isPending}
              onChange={(v) => update.mutate({ showUsdEquivalent: v })}
            />
          </div>
        )}
      </section>

      <section className="card stack" style={{ gap: 10 }}>
        <label htmlFor="budget" className="section-title" style={{ margin: 0 }}>
          Monthly budget
        </label>
        <div className="inline-form">
          <input
            id="budget"
            className="input mono"
            inputMode="decimal"
            placeholder="None"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveBudget()}
          />
          <span className="row small muted" style={{ paddingRight: 4 }}>
            {user.defaultCurrency}
          </span>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={!budgetChanged || update.isPending}
            onClick={saveBudget}
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
        <span className="caption">
          {user.monthlyBudgetMinor === null
            ? 'Leave empty for no budget.'
            : `Saved as ${formatMinor(user.monthlyBudgetMinor, user.defaultCurrency)}. Clear it for no budget.`}
        </span>
        {budgetError ? <Notice kind="error">{budgetError}</Notice> : null}
      </section>

      <Link to="/categories" className="card row row--between" style={{ color: 'inherit' }}>
        <span style={{ fontWeight: 500 }}>Categories</span>
        <span className="muted small">
          {categories.data
            ? `${categories.data.categories.length} ${categories.data.categories.length === 1 ? 'category' : 'categories'}`
            : ''}{' '}
          ›
        </span>
      </Link>

      <Link to="/import" className="card row row--between" style={{ color: 'inherit' }}>
        <span style={{ fontWeight: 500 }}>Import a statement</span>
        <span className="muted small">CSV or JSON ›</span>
      </Link>

      <section className="card stack" style={{ gap: 10 }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Theme
        </h2>
        <Segmented<Theme>
          label="Theme"
          value={user.theme}
          disabled={update.isPending}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(theme) => {
            applyTheme(theme);
            update.mutate({ theme });
          }}
        />
      </section>

      {update.isError ? <Notice kind="error">{errorMessage(update.error)}</Notice> : null}

      <section className="card stack" style={{ gap: 12 }}>
        <div>
          <div style={{ fontWeight: 500 }}>{user.email}</div>
          <div className="caption">
            This inbox is the one WebSpend reads, and only for messages from the banks you switch
            on.
          </div>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={signOut}>
            Sign out
          </button>
          {signOutError ? <span className="small danger-text">{signOutError}</span> : null}
        </div>
      </section>
    </div>
  );
}
