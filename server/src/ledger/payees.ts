import type { Db } from '../db/index.ts';

/**
 * The key a transaction is remembered under: the counterparty's name normalised, else the first
 * three words of the bank's description. Null when neither exists (a manual entry with no payee).
 */
export function payeeKeyFor(input: {
  counterpartyName: string | null;
  bankDescription: string | null;
}): string | null {
  if (input.counterpartyName) {
    const key = normalise(input.counterpartyName);
    if (key) return key;
  }
  if (input.bankDescription) {
    const key = normalise(input.bankDescription).split(' ').slice(0, 3).join(' ');
    if (key) return key;
  }
  return null;
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function rememberedCategory(
  db: Db,
  userId: string,
  payeeKey: string,
): Promise<string | null> {
  const [row] = await db.query<{ category_id: string }>(
    'select category_id from payee_rules where user_id = $1 and payee_key = $2',
    [userId, payeeKey],
  );
  return row ? row.category_id : null;
}

export async function rememberCategory(
  db: Db,
  userId: string,
  payeeKey: string,
  categoryId: string,
): Promise<void> {
  await db.query(
    `insert into payee_rules (user_id, payee_key, category_id) values ($1, $2, $3::uuid)
     on conflict (user_id, payee_key) do update
       set category_id = excluded.category_id, updated_at = now()`,
    [userId, payeeKey, categoryId],
  );
}

export async function forgetPayee(db: Db, userId: string, payeeKey: string): Promise<void> {
  await db.query('delete from payee_rules where user_id = $1 and payee_key = $2', [
    userId,
    payeeKey,
  ]);
}

export async function categoriseUncategorisedOfPayee(
  db: Db,
  userId: string,
  payeeKey: string,
  categoryId: string,
): Promise<number> {
  const rows = await db.query(
    `update transactions set category_id = $3::uuid
      where user_id = $1 and payee_key = $2 and category_id is null and type <> 'transfer'
      returning id`,
    [userId, payeeKey, categoryId],
  );
  return rows.length;
}
