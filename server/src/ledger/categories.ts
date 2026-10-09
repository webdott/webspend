import type { Category } from '@webspend/shared';
import type { Db, Row } from '../db/index.ts';
import { ConflictError, NotFoundError } from './errors.ts';

const COLUMNS = 'id, name, sort_order';

export function toCategory(row: Row): Category {
  return { id: String(row.id), name: String(row.name), sortOrder: Number(row.sort_order) };
}

export async function listCategories(db: Db, userId: string): Promise<Category[]> {
  const rows = await db.query(
    `select ${COLUMNS} from categories where user_id = $1 order by sort_order, name`,
    [userId],
  );
  return rows.map(toCategory);
}

export async function getCategory(db: Db, userId: string, id: string): Promise<Category> {
  const [row] = await db.query(
    `select ${COLUMNS} from categories where user_id = $1 and id = $2::uuid`,
    [userId, id],
  );
  if (!row) throw new NotFoundError('category not found');
  return toCategory(row);
}

export async function createCategory(db: Db, userId: string, name: string): Promise<Category> {
  if (await nameTaken(db, userId, name, null))
    throw new ConflictError('a category with that name exists');
  const [row] = await db.query(
    `insert into categories (user_id, name, sort_order)
     values ($1, $2, (select coalesce(max(sort_order), -1) + 1 from categories where user_id = $1))
     returning ${COLUMNS}`,
    [userId, name],
  );
  return toCategory(row!);
}

export async function ensureCategory(db: Db, userId: string, name: string): Promise<Category> {
  const [existing] = await db.query(
    `select ${COLUMNS} from categories where user_id = $1 and lower(name) = lower($2)`,
    [userId, name],
  );
  if (existing) return toCategory(existing);
  return createCategory(db, userId, name);
}

export async function updateCategory(
  db: Db,
  userId: string,
  id: string,
  patch: { name?: string; sortOrder?: number },
): Promise<Category> {
  await getCategory(db, userId, id);
  if (patch.name !== undefined && (await nameTaken(db, userId, patch.name, id))) {
    throw new ConflictError('a category with that name exists');
  }
  const [row] = await db.query(
    `update categories set name = coalesce($3, name), sort_order = coalesce($4, sort_order)
     where user_id = $1 and id = $2::uuid returning ${COLUMNS}`,
    [userId, id, patch.name ?? null, patch.sortOrder ?? null],
  );
  return toCategory(row!);
}

/** Transactions in the category become uncategorised (`on delete set null`). */
export async function deleteCategory(db: Db, userId: string, id: string): Promise<void> {
  await getCategory(db, userId, id);
  await db.query('delete from categories where user_id = $1 and id = $2::uuid', [userId, id]);
}

async function nameTaken(db: Db, userId: string, name: string, exceptId: string | null) {
  const rows = await db.query(
    `select 1 from categories
      where user_id = $1 and lower(name) = lower($2) and ($3::uuid is null or id <> $3::uuid)`,
    [userId, name, exceptId],
  );
  return rows.length > 0;
}
