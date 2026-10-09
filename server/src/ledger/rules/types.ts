import type { Currency, TransactionSource, TransactionType } from '@webspend/shared';
import type { Row } from '../../db/index.ts';
import { iso, text } from '../../db/rows.ts';

export type Leg = {
  id: string;
  accountId: string;
  bank: string;
  type: TransactionType;
  direction: 'debit' | 'credit';
  amountMinor: number;
  currency: Currency;
  occurredAt: string;
  counterpartyName: string | null;
  counterpartyBank: string | null;
  counterpartyAccount: string | null;
  bankReference: string | null;
  transferGroupId: string | null;
  source: TransactionSource;
  isFee: boolean;
};

export const LEG_SELECT = `select o.id, o.account_id, oa.bank, o.type, o.direction, o.amount_minor,
    o.currency, o.occurred_at, o.counterparty_name, o.counterparty_bank, o.counterparty_account,
    o.bank_reference, o.transfer_group_id, o.source, o.is_fee
  from transactions o join accounts oa on oa.id = o.account_id`;

export function toLeg(row: Row): Leg {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    bank: String(row.bank),
    type: row.type as TransactionType,
    direction: row.direction as Leg['direction'],
    amountMinor: Number(row.amount_minor),
    currency: row.currency as Currency,
    occurredAt: iso(row.occurred_at),
    counterpartyName: text(row.counterparty_name),
    counterpartyBank: text(row.counterparty_bank),
    counterpartyAccount: text(row.counterparty_account),
    bankReference: text(row.bank_reference),
    transferGroupId: text(row.transfer_group_id),
    source: row.source as TransactionSource,
    isFee: Boolean(row.is_fee),
  };
}

/** A leg that is free to pair: not a transfer yet, or a transfer whose group has no other member. */
export const UNPAIRED = `(o.transfer_group_id is null or not exists (
    select 1 from transactions p where p.transfer_group_id = o.transfer_group_id and p.id <> o.id))`;
