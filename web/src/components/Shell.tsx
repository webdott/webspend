import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { formatRate } from '@webspend/shared';
import { useMe, useRates } from '../api/hooks.ts';
import { isApiError } from '../api/client.ts';
import { applyTheme } from '../theme.ts';
import {
  AddTransactionButton,
  AddTransactionContext,
  AddTransactionDialog,
} from './AddTransaction.tsx';
import { Logo } from './Logo.tsx';
import { ErrorState, LoadingState } from './ui.tsx';
import { UserContext } from './user.ts';

const SECTIONS = [
  { to: '/', label: 'Summary' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/categories', label: 'Categories' },
  { to: '/import', label: 'Import' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/settings', label: 'Settings' },
];

export function Shell() {
  const me = useMe();
  const location = useLocation();
  const user = me.data?.user;
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    applyTheme(user?.theme);
  }, [user?.theme]);

  if (me.isPending) {
    return (
      <div className="shell">
        <LoadingState label="Signing you in" />
      </div>
    );
  }
  if (me.isError) {
    if (isApiError(me.error) && me.error.status === 401) {
      return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
    }
    return (
      <div className="shell">
        <ErrorState error={me.error} retry={() => me.refetch()} />
      </div>
    );
  }

  return (
    <UserContext.Provider value={user!}>
      <AddTransactionContext.Provider value={() => setAdding(true)}>
        <div className="shell">
          <Header />
          <main className="main">
            <Outlet />
          </main>
          <button
            type="button"
            className="fab"
            aria-label="Add a transaction"
            onClick={() => setAdding(true)}
          >
            +
          </button>
          <TabBar />
        </div>
        {adding ? <AddTransactionDialog onClose={() => setAdding(false)} /> : null}
      </AddTransactionContext.Provider>
    </UserContext.Provider>
  );
}

function Header() {
  const me = useMe();
  const rates = useRates();
  const user = me.data?.user;
  const rate = rates.data?.rates.find((r) => r.currency === user?.defaultCurrency);
  const showRate = user && user.defaultCurrency !== 'USD' && user.showUsdEquivalent && rate;
  return (
    <header className="header">
      <div className="header__inner">
        <NavLink to="/" className="wordmark" aria-label="WebSpend home">
          <Logo />
          WebSpend
        </NavLink>
        <nav className="nav" aria-label="Sections">
          {SECTIONS.map((s) => (
            <NavLink key={s.to} to={s.to} end={s.to === '/'}>
              {s.label}
            </NavLink>
          ))}
        </nav>
        {showRate ? (
          <span className="rate-line mono" title="Today's rate">
            {formatRate(rate.perUsd, user.defaultCurrency)}
          </span>
        ) : null}
        <AddTransactionButton className="header__add" />
      </div>
    </header>
  );
}

function TabBar() {
  return (
    <nav className="tabbar" aria-label="Sections">
      <NavLink to="/" end>
        <Icon name="summary" />
        Summary
      </NavLink>
      <NavLink to="/transactions">
        <Icon name="activity" />
        Activity
      </NavLink>
      <NavLink to="/accounts">
        <Icon name="accounts" />
        Accounts
      </NavLink>
      <NavLink to="/settings">
        <Icon name="settings" />
        Settings
      </NavLink>
    </nav>
  );
}

function Icon({ name }: { name: 'summary' | 'activity' | 'accounts' | 'settings' }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'summary':
      return (
        <svg {...common}>
          <path d="M4 19V10M10 19V5M16 19v-7M22 19H2" />
        </svg>
      );
    case 'activity':
      return (
        <svg {...common}>
          <path d="M3 12h4l3-7 4 14 3-7h4" />
        </svg>
      );
    case 'accounts':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="3" />
          <path d="M3 10h18M7 15h3" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      );
  }
}
