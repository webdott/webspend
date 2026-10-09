import { Link } from 'react-router-dom';
import type { Transaction } from '@webspend/shared';
import { Amount, RowIcon } from './ui.tsx';

export function TransactionRow({
  t,
  showUsd,
  card,
}: {
  t: Transaction;
  showUsd: boolean;
  card?: boolean;
}) {
  return (
    <Link to={`/transactions/${t.id}`} className={`tx-row${card ? ' tx-row--card' : ''}`}>
      <RowIcon title={t.title} type={t.type} />
      <span style={{ minWidth: 0 }}>
        <span className="tx-row__title">{t.title}</span>
        <span className="tx-row__meta">
          <CategoryLabel t={t} /> · {t.accountName}
        </span>
      </span>
      <Amount
        className="tx-row__amount"
        minor={t.amountMinor}
        currency={t.currency}
        type={t.type}
        usdMinor={t.usdMinor}
        showUsd={showUsd}
      />
    </Link>
  );
}

export function CategoryLabel({ t }: { t: Transaction }) {
  if (!t.unsureTransfer) return <CategoryName t={t} />;
  return (
    <>
      <CategoryName t={t} /> · <span className="accent-text">Unsure</span>
    </>
  );
}

function CategoryName({ t }: { t: Transaction }) {
  if (t.type === 'transfer') return <>Transfer to self</>;
  if (t.categoryName) return <>{t.categoryName}</>;
  if (t.type === 'income') return <>Income</>;
  return <span className="accent-text">Needs a category</span>;
}
