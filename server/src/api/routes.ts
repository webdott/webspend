import { Hono } from 'hono';
import {
  type AccountsResponse,
  type AlertsResponse,
  type CategoriesResponse,
  type CreateAccountRequest,
  createAccountSchema,
  createCategorySchema,
  createTransactionSchema,
  daySchema,
  type ExportQuery,
  exportQuerySchema,
  type ImportCommitRequest,
  importCommitSchema,
  importPreviewSchema,
  intakeEmailSchema,
  type MeResponse,
  monthSchema,
  NO_ACCOUNT,
  type RatesResponse,
  type TransactionsResponse,
  type TransactionType,
  type Currency,
  type UpdateSettingsRequest,
  updateAccountSchema,
  updateCategorySchema,
  updateSettingsSchema,
  updateTransactionSchema,
} from '@webspend/shared';
import type { Config } from '../config.ts';
import type { Db } from '../db/index.ts';
import { buildExport } from '../export/index.ts';
import { commitImport, previewImport } from '../import/index.ts';
import { listAlerts, processAlertEmail } from '../intake/pipeline.ts';
import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  updateAccount,
} from '../ledger/accounts.ts';
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from '../ledger/categories.ts';
import {
  categoriseUncategorisedOfPayee,
  forgetPayee,
  payeeKeyFor,
  rememberCategory,
} from '../ledger/payees.ts';
import { recordTransaction } from '../ledger/record.ts';
import { remarkTransaction } from '../ledger/rules/remark.ts';
import { monthSummary } from '../ledger/summary.ts';
import { currentMonth, todayLagos } from '../ledger/time.ts';
import {
  deleteTransaction,
  getTransaction,
  getTransactionRow,
  listTransactions,
  setTransactionFields,
} from '../ledger/transactions.ts';
import { findUserByEmail, updateSettings } from '../ledger/users.ts';
import type { RateSource } from '../rates/source.ts';
import { ratesOn, refreshToday } from '../rates/store.ts';
import type { AppEnv } from './app.ts';
import { HttpError, parseBody, requireUuid } from './errors.ts';

type Deps = { db: Db; config: Config; rateSource: RateSource };

export function apiRoutes({ db, config, rateSource }: Deps): Hono<AppEnv> {
  const api = new Hono<AppEnv>();
  const recordOptions = { rateSource };
  const transactionId = (value: string) => requireUuid(value, 'transaction');

  api.get('/me', (c) => {
    const body: MeResponse = { user: c.get('user') };
    return c.json(body);
  });

  api.patch('/settings', async (c) => {
    // The shared schemas type enum values as plain strings; validation already narrowed them.
    const patch = (await parseBody(c, updateSettingsSchema)) as UpdateSettingsRequest;
    const user = await updateSettings(db, c.get('user').id, patch);
    return c.json({ user });
  });

  api.get('/summary', async (c) => {
    const month = c.req.query('month') ?? currentMonth();
    if (!monthSchema.safeParse(month).success) {
      throw new HttpError(400, 'invalid_request', 'month must be YYYY-MM');
    }
    return c.json(await monthSummary(db, c.get('user'), month));
  });

  api.get('/exports', async (c) => {
    const parsed = exportQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
      throw new HttpError(400, 'invalid_request', `${where}${issue?.message ?? 'invalid query'}`);
    }
    const file = await buildExport(db, c.get('user'), parsed.data as ExportQuery);
    c.header('Content-Type', file.contentType);
    c.header('Content-Disposition', `attachment; filename="${file.filename}"`);
    c.header('Cache-Control', 'no-store');
    const { buffer, byteOffset, byteLength } = file.body;
    return c.body(buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer);
  });

  api.get('/transactions', async (c) => {
    const user = c.get('user');
    const q = c.req.query();
    if (q.month && !monthSchema.safeParse(q.month).success) {
      throw new HttpError(400, 'invalid_request', 'month must be YYYY-MM');
    }
    if (q.type && !['expense', 'income', 'transfer'].includes(q.type)) {
      throw new HttpError(400, 'invalid_request', 'type must be expense, income or transfer');
    }
    if (q.before && Number.isNaN(Date.parse(q.before))) {
      throw new HttpError(400, 'invalid_request', 'before must be an ISO timestamp');
    }
    const limit = q.limit ? Number(q.limit) : undefined;
    if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
      throw new HttpError(400, 'invalid_request', 'limit must be a positive integer');
    }
    const body: TransactionsResponse = await listTransactions(db, user, {
      month: q.month,
      q: q.q,
      categoryId: q.categoryId,
      accountId: q.accountId,
      type: q.type as TransactionType | undefined,
      unsure: q.unsure === 'true',
      limit,
      before: q.before,
    });
    return c.json(body);
  });

  api.get('/transactions/:id', async (c) => {
    const transaction = await getTransaction(db, c.get('user'), transactionId(c.req.param('id')));
    return c.json({ transaction });
  });

  api.patch('/transactions/:id', async (c) => {
    const user = c.get('user');
    const id = transactionId(c.req.param('id'));
    const patch = await parseBody(c, updateTransactionSchema);
    const row = await getTransactionRow(db, user.id, id);
    if (patch.categoryId) await getCategory(db, user.id, requireUuid(patch.categoryId, 'category'));

    await setTransactionFields(db, user.id, id, patch);
    if (patch.type !== undefined) await remarkTransaction(db, user.id, id, patch.type);

    if (patch.rememberForPayee && patch.categoryId !== undefined) {
      const payeeKey =
        (row.payee_key as string | null) ??
        payeeKeyFor({
          counterpartyName: row.counterparty_name as string | null,
          bankDescription: row.bank_description as string | null,
        });
      if (payeeKey) {
        if (patch.categoryId === null) await forgetPayee(db, user.id, payeeKey);
        else {
          await rememberCategory(db, user.id, payeeKey, patch.categoryId);
          await categoriseUncategorisedOfPayee(db, user.id, payeeKey, patch.categoryId);
        }
      }
    }
    return c.json({ transaction: await getTransaction(db, user, id) });
  });

  api.post('/transactions', async (c) => {
    const user = c.get('user');
    const input = await parseBody(c, createTransactionSchema);
    await getAccount(db, user.id, requireUuid(input.accountId, 'account'));
    if (input.categoryId) await getCategory(db, user.id, requireUuid(input.categoryId, 'category'));
    const { transaction } = await recordTransaction(
      db,
      user,
      {
        accountId: input.accountId,
        occurredAt: input.occurredAt,
        type: input.type,
        amountMinor: input.amountMinor,
        currency: input.currency as Currency,
        userDescription: input.userDescription,
        categoryId: input.type === 'transfer' ? null : (input.categoryId ?? null),
        counterpartyName: input.counterpartyName ?? null,
        source: 'manual',
      },
      recordOptions,
    );
    return c.json({ transaction }, 201);
  });

  api.delete('/transactions/:id', async (c) => {
    const user = c.get('user');
    const id = transactionId(c.req.param('id'));
    const row = await getTransactionRow(db, user.id, id);
    if (row.source === 'alert' && !row.is_fee) {
      throw new HttpError(409, 'conflict', 'transactions from alerts cannot be deleted');
    }
    await deleteTransaction(db, user.id, id);
    return c.body(null, 204);
  });

  api.get('/categories', async (c) => {
    const body: CategoriesResponse = { categories: await listCategories(db, c.get('user').id) };
    return c.json(body);
  });
  api.post('/categories', async (c) => {
    const { name } = await parseBody(c, createCategorySchema);
    return c.json({ category: await createCategory(db, c.get('user').id, name) }, 201);
  });
  api.patch('/categories/:id', async (c) => {
    const patch = await parseBody(c, updateCategorySchema);
    const category = await updateCategory(
      db,
      c.get('user').id,
      requireUuid(c.req.param('id'), 'category'),
      patch,
    );
    return c.json({ category });
  });
  api.delete('/categories/:id', async (c) => {
    await deleteCategory(db, c.get('user').id, requireUuid(c.req.param('id'), 'category'));
    return c.body(null, 204);
  });

  api.get('/accounts', async (c) => {
    const body: AccountsResponse = { accounts: await listAccounts(db, c.get('user').id) };
    return c.json(body);
  });
  api.post('/accounts', async (c) => {
    const input = (await parseBody(c, createAccountSchema)) as CreateAccountRequest;
    return c.json({ account: await createAccount(db, c.get('user').id, input) }, 201);
  });
  api.patch('/accounts/:id', async (c) => {
    const patch = await parseBody(c, updateAccountSchema);
    const account = await updateAccount(
      db,
      c.get('user').id,
      requireUuid(c.req.param('id'), 'account'),
      patch,
    );
    return c.json({ account });
  });
  api.delete('/accounts/:id', async (c) => {
    await deleteAccount(db, c.get('user').id, requireUuid(c.req.param('id'), 'account'));
    return c.body(null, 204);
  });

  api.get('/alerts', async (c) => {
    const filter = c.req.query('status') === 'failed' ? 'failed' : 'all';
    const body: AlertsResponse = { alerts: await listAlerts(db, c.get('user').id, filter) };
    return c.json(body);
  });

  api.get('/rates', async (c) => {
    const day = c.req.query('day') ?? todayLagos();
    if (!daySchema.safeParse(day).success) {
      throw new HttpError(400, 'invalid_request', 'day must be YYYY-MM-DD');
    }
    const body: RatesResponse = { rates: await ratesOn(db, day) };
    return c.json(body);
  });
  api.post('/rates/refresh', async (c) => {
    try {
      const body: RatesResponse = { rates: await refreshToday(db, rateSource) };
      return c.json(body);
    } catch (error) {
      throw new HttpError(502, 'rate_source_unavailable', (error as Error).message);
    }
  });

  api.post('/imports/preview', async (c) => {
    const input = await parseBody(c, importPreviewSchema);
    if (input.accountId !== NO_ACCOUNT) {
      await getAccount(db, c.get('user').id, requireUuid(input.accountId, 'account'));
    }
    return c.json(previewImport(input));
  });
  api.post('/imports', async (c) => {
    const user = c.get('user');
    const input = (await parseBody(c, importCommitSchema)) as ImportCommitRequest;
    if (input.accountId !== NO_ACCOUNT) requireUuid(input.accountId, 'account');
    return c.json(await commitImport(db, user, input, recordOptions));
  });

  api.post('/intake/email', async (c) => {
    const secret = c.req.header('x-intake-secret');
    if (!config.intakeSecret || secret !== config.intakeSecret) {
      throw new HttpError(401, 'unauthenticated', 'bad intake secret');
    }
    const input = await parseBody(c, intakeEmailSchema);
    const user = await findUserByEmail(db, input.userEmail);
    if (!user) throw new HttpError(404, 'not_found', 'no user with that email');
    const alert = await processAlertEmail(db, user, { userId: user.id, ...input }, recordOptions);
    return c.json({ alert });
  });

  return api;
}
