import type { Db } from '../../db/index.ts';
import { payeeKeyFor, rememberedCategory } from '../payees.ts';

/**
 * Rule 1, remembered category: a transaction arriving without a category takes the one the user
 * saved for its payee. Transfers to self are never categorised.
 */
export async function rememberedCategoryFor(
  db: Db,
  userId: string,
  input: { counterpartyName: string | null; bankDescription: string | null },
): Promise<{ payeeKey: string | null; categoryId: string | null }> {
  const payeeKey = payeeKeyFor(input);
  if (!payeeKey) return { payeeKey: null, categoryId: null };
  return { payeeKey, categoryId: await rememberedCategory(db, userId, payeeKey) };
}
