/**
 * Rule 4, re-marking. The user can call any transaction an expense, an income or a transfer to
 * self. Moving to or from `transfer` also updates the paired leg so a group is never half open.
 * Any re-mark, even to the type it already has, is the user's answer and clears the unsure tag.
 */
import type { TransactionType } from '@webspend/shared';
import type { Db } from '../../db/index.ts';
import { NotFoundError } from '../errors.ts';
import { startTransferGroup } from './transfer.ts';
import { LEG_SELECT, toLeg } from './types.ts';

export async function remarkTransaction(
  db: Db,
  userId: string,
  id: string,
  type: TransactionType,
): Promise<void> {
  const [row] = await db.query(`${LEG_SELECT} where o.user_id = $1 and o.id = $2::uuid`, [
    userId,
    id,
  ]);
  if (!row) throw new NotFoundError('transaction not found');
  const leg = toLeg(row);
  await db.query(
    'update transactions set unsure_transfer = false where user_id = $1 and id = $2::uuid',
    [userId, id],
  );
  if (leg.type === type) return;

  if (type === 'transfer') {
    await startTransferGroup(db, userId, leg);
    return;
  }

  if (leg.type === 'transfer' && leg.transferGroupId) {
    // The other leg goes back to what its direction says, unless it is the one being chosen for.
    await db.query(
      `update transactions set transfer_group_id = null,
         type = case when id = $2::uuid then $3
                     when direction = 'debit' then 'expense' else 'income' end
       where user_id = $1 and transfer_group_id = $4::uuid`,
      [userId, id, type, leg.transferGroupId],
    );
    return;
  }

  await db.query(
    'update transactions set type = $3, transfer_group_id = null where user_id = $1 and id = $2::uuid',
    [userId, id, type],
  );
}
