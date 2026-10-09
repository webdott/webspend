import { BANK_LABELS, TRACKED_BANKS, type Currency, type Theme, type User } from '@webspend/shared';
import type { Db, Row } from '../db/index.ts';
import { integerOrNull } from '../db/rows.ts';

export const DEFAULT_CATEGORIES = [
  'Rent & housing',
  'Food & groceries',
  'Transport',
  'Subscriptions',
  'Data & airtime',
  'Fees',
];

const COLUMNS = 'id, email, default_currency, show_usd_equivalent, theme, monthly_budget_minor';

export function toUser(row: Row): User {
  return {
    id: String(row.id),
    email: String(row.email),
    defaultCurrency: row.default_currency as Currency,
    showUsdEquivalent: Boolean(row.show_usd_equivalent),
    theme: row.theme as Theme,
    monthlyBudgetMinor: integerOrNull(row.monthly_budget_minor),
  };
}

export async function getUser(db: Db, id: string): Promise<User | null> {
  const [row] = await db.query(`select ${COLUMNS} from users where id = $1`, [id]);
  return row ? toUser(row) : null;
}

export async function findUserByEmail(db: Db, email: string): Promise<User | null> {
  const [row] = await db.query(`select ${COLUMNS} from users where email = $1`, [
    email.trim().toLowerCase(),
  ]);
  return row ? toUser(row) : null;
}

/**
 * Returns the user for an email, creating them on first sign-in together with the default
 * category list and one account per bank so the setup checklist has something to show.
 */
export async function ensureUser(db: Db, email: string): Promise<User> {
  const existing = await findUserByEmail(db, email);
  if (existing) return existing;
  return db.transaction(async (tx) => {
    const [row] = await tx.query(`insert into users (email) values ($1) returning ${COLUMNS}`, [
      email.trim().toLowerCase(),
    ]);
    const user = toUser(row!);
    await createDefaults(tx, user.id);
    return user;
  });
}

export async function createDefaults(db: Db, userId: string): Promise<void> {
  for (const [index, name] of DEFAULT_CATEGORIES.entries()) {
    await db.query(
      'insert into categories (user_id, name, sort_order) values ($1, $2, $3) on conflict do nothing',
      [userId, name, index],
    );
  }
  for (const bank of TRACKED_BANKS) {
    await db.query(
      `insert into accounts (user_id, bank, name, currency, is_own, tracked)
       values ($1, $2, $3, $4, true, false)`,
      [userId, bank, BANK_LABELS[bank], bank === 'grey' ? 'USD' : 'NGN'],
    );
  }
  await db.query(
    `insert into accounts (user_id, bank, name, currency, is_own, tracked)
     values ($1, 'cash', 'Cash', 'NGN', true, false)`,
    [userId],
  );
}

export type SettingsPatch = Partial<
  Pick<User, 'defaultCurrency' | 'showUsdEquivalent' | 'theme' | 'monthlyBudgetMinor'>
>;

export async function updateSettings(db: Db, userId: string, patch: SettingsPatch): Promise<User> {
  const [row] = await db.query(
    `update users set
       default_currency = coalesce($2, default_currency),
       show_usd_equivalent = coalesce($3, show_usd_equivalent),
       theme = coalesce($4, theme),
       monthly_budget_minor = case when $5 then $6::bigint else monthly_budget_minor end
     where id = $1 returning ${COLUMNS}`,
    [
      userId,
      patch.defaultCurrency ?? null,
      patch.showUsdEquivalent ?? null,
      patch.theme ?? null,
      'monthlyBudgetMinor' in patch,
      patch.monthlyBudgetMinor ?? null,
    ],
  );
  return toUser(row!);
}

export async function listPollableUsers(db: Db): Promise<User[]> {
  const rows = await db.query(
    `select ${COLUMNS} from users u
      where exists (select 1 from mailbox_tokens m where m.user_id = u.id)
        and exists (select 1 from accounts a where a.user_id = u.id and a.tracked)`,
  );
  return rows.map(toUser);
}
