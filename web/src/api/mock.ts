/**
 * In-memory fake of the WebSpend API, used when `VITE_MOCK=1`.
 *
 * It honours the query parameters from the contract, computes the summary from the transactions
 * it holds, and keeps edits for the lifetime of the page. Dates are relative to "now" so the
 * current month always looks like the mockup.
 */
import type {
  Account,
  Bank,
  Category,
  Currency,
  DateOrder,
  FxRate,
  ImportCommitRequest,
  ImportField,
  ImportMapping,
  ImportPreviewRequest,
  ImportPreviewResponse,
  RawAlert,
  Summary,
  Transaction,
  TransactionType,
  User,
  CategoryTotal,
} from '@webspend/shared';
import { BANK_LABELS, toUsdMinor } from '@webspend/shared';
import { ApiError } from './client.ts';
import { guessMapping, parseCsv, rowsToTransactions } from '../lib/importMapping.ts';
import { dayOf, monthOf } from '../lib/dates.ts';

const LATENCY_MS = 180;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let seq = 100;
const nextId = (prefix: string) => `${prefix}_${(seq++).toString(36)}`;

function at(daysAgo: number, hhmm: string): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const [h = '12', m = '00'] = hhmm.split(':');
  d.setHours(Number(h), Number(m), 0, 0);
  return d.toISOString();
}

function daysAgoMonths(months: number, day: number, hhmm = '09:00'): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months, day);
  const [h = '12', m = '00'] = hhmm.split(':');
  d.setHours(Number(h), Number(m), 0, 0);
  return d.toISOString();
}

const PER_USD: Record<Currency, number> = { NGN: 1500, USD: 1, GBP: 0.76, EUR: 0.88 };

let signedIn = true;

const user: User = {
  id: 'u_1',
  email: 'uche@example.com',
  defaultCurrency: 'NGN',
  showUsdEquivalent: true,
  theme: 'auto',
  monthlyBudgetMinor: 120_000_000,
};

const categories: Category[] = [
  { id: 'c_rent', name: 'Rent & housing', sortOrder: 0 },
  { id: 'c_food', name: 'Food & groceries', sortOrder: 1 },
  { id: 'c_transport', name: 'Transport', sortOrder: 2 },
  { id: 'c_subs', name: 'Subscriptions', sortOrder: 3 },
  { id: 'c_data', name: 'Data & airtime', sortOrder: 4 },
  { id: 'c_health', name: 'Health', sortOrder: 5 },
  { id: 'c_fees', name: 'Bank fees', sortOrder: 6 },
];

const accounts: Account[] = [
  {
    id: 'a_grey',
    bank: 'grey',
    name: 'Grey',
    accountNumber: null,
    currency: 'NGN',
    isOwn: true,
    tracked: true,
    trackingFrom: daysAgoMonths(1, 1),
    status: 'tracking',
    lastBalanceMinor: 200_000_000,
    lastBalanceAt: at(7, '10:12'),
    lastAlertAt: at(7, '10:12'),
  },
  {
    id: 'a_opay',
    bank: 'opay',
    name: 'OPay wallet',
    accountNumber: '8123456789',
    currency: 'NGN',
    isOwn: true,
    tracked: true,
    trackingFrom: daysAgoMonths(1, 1),
    status: 'tracking',
    lastBalanceMinor: 6_425_000,
    lastBalanceAt: at(0, '08:15'),
    lastAlertAt: at(0, '08:15'),
  },
  {
    id: 'a_moniepoint',
    bank: 'moniepoint',
    name: 'Moniepoint',
    accountNumber: '5012345678',
    currency: 'NGN',
    isOwn: true,
    tracked: true,
    trackingFrom: at(1, '09:30'),
    status: 'waiting',
    lastBalanceMinor: null,
    lastBalanceAt: null,
    lastAlertAt: null,
  },
  {
    id: 'a_gtbank',
    bank: 'gtbank',
    name: 'GTBank savings',
    accountNumber: '0123456789',
    currency: 'NGN',
    isOwn: true,
    tracked: true,
    trackingFrom: daysAgoMonths(1, 1),
    status: 'tracking',
    lastBalanceMinor: 138_620_000,
    lastBalanceAt: at(4, '17:48'),
    lastAlertAt: at(4, '17:48'),
  },
  {
    id: 'a_uba',
    bank: 'uba',
    name: 'UBA',
    accountNumber: '2098765432',
    currency: 'NGN',
    isOwn: true,
    tracked: false,
    trackingFrom: null,
    status: 'off',
    lastBalanceMinor: null,
    lastBalanceAt: null,
    lastAlertAt: null,
  },
  {
    id: 'a_cash',
    bank: 'cash',
    name: 'Cash',
    accountNumber: null,
    currency: 'NGN',
    isOwn: true,
    tracked: false,
    trackingFrom: null,
    status: 'off',
    lastBalanceMinor: null,
    lastBalanceAt: null,
    lastAlertAt: null,
  },
  {
    id: 'a_zenith',
    bank: 'other',
    name: 'Zenith current',
    accountNumber: '2233445566',
    currency: 'NGN',
    isOwn: true,
    tracked: false,
    trackingFrom: null,
    status: 'off',
    lastBalanceMinor: null,
    lastBalanceAt: null,
    lastAlertAt: null,
  },
];

type Stored = Omit<
  Transaction,
  | 'defaultMinor'
  | 'defaultCurrency'
  | 'usdMinor'
  | 'fxPerUsd'
  | 'accountName'
  | 'bank'
  | 'title'
  | 'categoryName'
>;

function tx(
  id: string,
  occurredAt: string,
  type: TransactionType,
  amountMinor: number,
  accountId: string,
  opts: Partial<Stored> & { payee?: string | null } = {},
): Stored {
  const { payee = null, ...rest } = opts;
  return {
    id,
    occurredAt,
    type,
    amountMinor,
    currency: 'NGN',
    accountId,
    counterpartyName: payee,
    counterpartyBank: null,
    counterpartyAccount: null,
    bankDescription: null,
    userDescription: null,
    categoryId: null,
    source: 'alert',
    bankReference: null,
    transferGroupId: null,
    isFee: false,
    unsureTransfer: false,
    createdAt: occurredAt,
    ...rest,
  };
}

const transactions: Stored[] = [
  tx('t_corner', at(0, '09:40'), 'expense', 1_240_000, 'a_gtbank', {
    payee: 'Corner Mart',
    categoryId: 'c_food',
    bankDescription: 'POS PURCHASE CORNER MART LEKKI 0940',
    bankReference: 'GTB-7F21A',
    counterpartyBank: null,
  }),
  tx('t_paystack', at(0, '08:15'), 'expense', 1_850_000, 'a_opay', {
    payee: 'Paystack',
    bankDescription: 'Transfer to PAYSTACK-CHECKOUT 0012345678 Titan Trust Bank',
    counterpartyBank: 'Titan Trust Bank',
    counterpartyAccount: '0012345678',
    bankReference: 'OP-2210993',
  }),
  tx('t_ride', at(1, '18:20'), 'expense', 720_000, 'a_opay', {
    payee: 'Bolt',
    userDescription: 'Ride to Ikeja',
    categoryId: 'c_transport',
    bankDescription: 'Transfer to BOLT OPERATIONS *****45678 Providus',
    counterpartyAccount: '*****45678',
    unsureTransfer: true,
    bankReference: 'OP-2210871',
  }),
  tx('t_airtime', at(1, '12:05'), 'expense', 500_000, 'a_opay', {
    payee: 'MTN',
    userDescription: 'Airtime top-up',
    categoryId: 'c_data',
    bankDescription: 'Airtime purchase MTN 0803xxxx123',
    bankReference: 'OP-2210640',
  }),
  tx('t_cloud', at(3, '02:00'), 'expense', 2_930_000, 'a_gtbank', {
    payee: 'Cloud hosting',
    categoryId: 'c_subs',
    bankDescription: 'WEB PURCHASE HETZNER ONLINE GMBH',
    bankReference: 'GTB-7E9C2',
  }),
  tx('t_fuel', at(4, '17:48'), 'expense', 4_500_000, 'a_gtbank', {
    payee: 'Fuel station',
    categoryId: 'c_transport',
    bankDescription: 'POS PURCHASE NNPC RETAIL ADMIRALTY',
    bankReference: 'GTB-7D88B',
  }),
  tx('t_stream', at(5, '06:10'), 'expense', 1_200_000, 'a_gtbank', {
    payee: 'Streaming',
    categoryId: 'c_subs',
    bankDescription: 'WEB PURCHASE NETFLIX.COM',
    bankReference: 'GTB-7D102',
  }),
  tx('t_lunch', at(5, '13:30'), 'expense', 4_600_000, 'a_opay', {
    payee: 'Chowdeck',
    userDescription: 'Lunch orders this week',
    categoryId: 'c_food',
    bankDescription: 'Transfer to CHOWDECK TECHNOLOGIES 0098765432 Wema',
    bankReference: 'OP-2209911',
  }),
  tx('t_market', at(6, '10:00'), 'expense', 4_120_000, 'a_gtbank', {
    payee: 'Market run',
    categoryId: 'c_food',
    bankDescription: 'ATM WITHDRAWAL GTB LEKKI PHASE 1',
    bankReference: 'GTB-7C4F0',
  }),
  tx('t_shoprite', at(6, '16:45'), 'expense', 6_840_000, 'a_gtbank', {
    payee: 'Shoprite',
    categoryId: 'c_food',
    bankDescription: 'POS PURCHASE SHOPRITE IKEJA CITY MALL',
    bankReference: 'GTB-7C3A1',
  }),
  tx('t_ridevi', at(7, '20:15'), 'expense', 2_200_000, 'a_opay', {
    payee: 'Uber',
    userDescription: 'Ride to Victoria Island',
    categoryId: 'c_transport',
    bankDescription: 'Transfer to UBER BV 0011223344 Access',
    bankReference: 'OP-2208745',
  }),
  tx('t_xfer_out', at(7, '10:12'), 'transfer', 100_000_000, 'a_grey', {
    payee: 'GTBank savings',
    bankDescription: 'Withdrawal to GTBank 0123456789',
    bankReference: 'GRY-55A1',
    transferGroupId: 'g_1',
  }),
  tx('t_xfer_in', at(7, '10:13'), 'transfer', 100_000_000, 'a_gtbank', {
    payee: 'Grey',
    bankDescription: 'TRANSFER FROM GREY FINANCE LTD',
    bankReference: 'GRY-55A1',
    transferGroupId: 'g_1',
  }),
  tx('t_rent', at(8, '09:05'), 'expense', 45_000_000, 'a_gtbank', {
    payee: 'Adeyemi Properties',
    userDescription: 'Rent, October',
    categoryId: 'c_rent',
    bankDescription: 'NIP TRANSFER TO ADEYEMI PROPERTIES LTD 3001234567 ZENITH',
    counterpartyBank: 'Zenith',
    counterpartyAccount: '3001234567',
    bankReference: 'GTB-7B000',
  }),
  tx('t_data', at(8, '07:30'), 'expense', 2_300_000, 'a_opay', {
    payee: 'MTN',
    userDescription: 'Monthly data bundle',
    categoryId: 'c_data',
    bankDescription: 'Data purchase MTN 0803xxxx123 75GB',
    bankReference: 'OP-2208102',
  }),
  tx('t_salary', at(8, '08:00'), 'income', 300_000_000, 'a_grey', {
    payee: 'Acme Studio',
    bankDescription: 'Incoming payment from ACME STUDIO INC',
    bankReference: 'GRY-54F0',
  }),
  tx('t_p_salary', daysAgoMonths(1, 1, '08:00'), 'income', 300_000_000, 'a_grey', {
    payee: 'Acme Studio',
    bankDescription: 'Incoming payment from ACME STUDIO INC',
    bankReference: 'GRY-51A0',
  }),
  tx('t_p_rent', daysAgoMonths(1, 1, '09:05'), 'expense', 45_000_000, 'a_gtbank', {
    payee: 'Adeyemi Properties',
    userDescription: 'Rent, September',
    categoryId: 'c_rent',
    bankDescription: 'NIP TRANSFER TO ADEYEMI PROPERTIES LTD 3001234567 ZENITH',
    bankReference: 'GTB-7A000',
  }),
  tx('t_p_groc', daysAgoMonths(1, 6, '11:20'), 'expense', 7_250_000, 'a_gtbank', {
    payee: 'Shoprite',
    categoryId: 'c_food',
    bankDescription: 'POS PURCHASE SHOPRITE IKEJA CITY MALL',
    bankReference: 'GTB-7A2C3',
  }),
  tx('t_p_pharm', daysAgoMonths(1, 12, '15:00'), 'expense', 1_875_000, 'a_opay', {
    payee: 'HealthPlus',
    categoryId: 'c_health',
    bankDescription: 'Transfer to HEALTHPLUS PHARMACY 0044556677 GTB',
    bankReference: 'OP-2190011',
  }),
  tx('t_p_fee', daysAgoMonths(1, 14, '23:59'), 'expense', 5_250, 'a_gtbank', {
    payee: 'GTBank',
    userDescription: 'SMS alert fee',
    categoryId: 'c_fees',
    isFee: true,
    bankDescription: null,
  }),
  tx('t_p_cash', daysAgoMonths(1, 20, '19:00'), 'expense', 350_000, 'a_cash', {
    payee: 'Street food',
    userDescription: 'Suya',
    categoryId: 'c_food',
    source: 'manual',
  }),
  tx('t_p_fuel', daysAgoMonths(1, 22, '08:30'), 'expense', 4_000_000, 'a_gtbank', {
    payee: 'Fuel station',
    categoryId: 'c_transport',
    bankDescription: 'POS PURCHASE TOTAL ENERGIES LEKKI',
    bankReference: 'GTB-7A9D1',
  }),
];

const alerts: RawAlert[] = [
  {
    id: 'al_1',
    receivedAt: at(2, '14:02'),
    sender: 'noreply@opay-nigeria.com',
    subject: 'Your OPay account statement is ready',
    status: 'not_a_transaction',
    detail: 'No amount or balance found in the message.',
    transactionId: null,
  },
  {
    id: 'al_2',
    receivedAt: at(3, '09:11'),
    sender: 'alerts@gtbank.com',
    subject: 'GeNS Transaction Alert',
    status: 'unrecognised_layout',
    detail: 'The message did not match any known GTBank layout. Kept for a parser fix.',
    transactionId: null,
  },
];

const payeeRules = new Map<string, string>();

function perUsdFor(currency: Currency): number {
  return PER_USD[currency];
}

function convert(minor: number, from: Currency, to: Currency): number {
  if (from === to) return minor;
  const usd = minor / perUsdFor(from);
  const v = usd * perUsdFor(to);
  return Math.sign(v) * Math.round(Math.abs(v));
}

function view(t: Stored): Transaction {
  const account = accounts.find((a) => a.id === t.accountId);
  const category = t.categoryId ? categories.find((c) => c.id === t.categoryId) : undefined;
  return {
    ...t,
    accountName: account?.name ?? 'Unknown account',
    bank: account?.bank ?? 'other',
    title: t.userDescription || t.counterpartyName || t.bankDescription || 'Transaction',
    categoryName: category?.name ?? null,
    defaultCurrency: user.defaultCurrency,
    defaultMinor: convert(t.amountMinor, t.currency, user.defaultCurrency),
    usdMinor: toUsdMinor(t.amountMinor, perUsdFor(t.currency)),
    fxPerUsd: perUsdFor(t.currency),
  };
}

function summaryFor(month: string): Summary {
  const inMonth = transactions.filter((t) => monthOf(t.occurredAt) === month);
  const expenses = inMonth.filter((t) => t.type === 'expense');
  const incomes = inMonth.filter((t) => t.type === 'income');
  const def = user.defaultCurrency;
  const sumDefault = (list: Stored[]) =>
    list.reduce((s, t) => s + convert(t.amountMinor, t.currency, def), 0);
  const sumUsd = (list: Stored[]) =>
    list.reduce((s, t) => s + toUsdMinor(t.amountMinor, perUsdFor(t.currency)), 0);
  const spentMinor = sumDefault(expenses);
  const incomeMinor = sumDefault(incomes);
  const budget = user.monthlyBudgetMinor;
  const groups = new Map<string | null, Stored[]>();
  for (const t of expenses) {
    const key = t.categoryId;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const byCategory: CategoryTotal[] = [...groups.entries()]
    .map(([categoryId, list]) => ({
      categoryId,
      name: categoryId
        ? (categories.find((c) => c.id === categoryId)?.name ?? 'Unknown')
        : 'Needs a category',
      minor: sumDefault(list),
      usdMinor: sumUsd(list),
      count: list.length,
    }))
    .sort((a, b) => b.minor - a.minor);
  const usdOrNull = (n: number) => (def === 'USD' ? null : n);
  const lastAlert = accounts
    .map((a) => a.lastAlertAt)
    .filter((x): x is string => !!x)
    .sort()
    .at(-1);
  return {
    month,
    currency: def,
    budgetMinor: budget,
    spentMinor,
    incomeMinor,
    leftMinor: budget === null ? null : budget - spentMinor,
    spentUsdMinor: usdOrNull(sumUsd(expenses)),
    incomeUsdMinor: usdOrNull(sumUsd(incomes)),
    leftUsdMinor:
      budget === null || def === 'USD' ? null : toUsdMinor(budget - spentMinor, perUsdFor(def)),
    todayPerUsd: def === 'USD' ? null : perUsdFor(def),
    byCategory,
    uncategorisedCount: expenses.filter((t) => !t.categoryId).length,
    lastAlertAt: lastAlert ?? null,
    trackedBanks: accounts.filter((a) => a.tracked).map((a) => a.bank),
  };
}

const notFound = (what: string) => new ApiError(404, 'not_found', `${what} not found`);
const unauthorised = () => new ApiError(401, 'unauthorised', 'Sign in to continue');

function bodyOf<T>(body: unknown): T {
  return (body ?? {}) as T;
}

export async function mockRequest(method: string, url: string, body?: unknown): Promise<unknown> {
  await sleep(LATENCY_MS);
  const u = new URL(url, 'http://mock.local');
  const path = u.pathname;
  const q = u.searchParams;
  const seg = path.split('/').filter(Boolean); // ['api', 'transactions', ':id']

  if (path === '/api/meta') return { version: 'mock', googleAuth: false, devAuth: true };
  if (path === '/auth/dev' && method === 'POST') {
    const { email } = bodyOf<{ email?: string }>(body);
    if (!email || !email.includes('@'))
      throw new ApiError(400, 'bad_request', 'Enter an email address');
    user.email = email;
    signedIn = true;
    return { token: 'mock-token', user };
  }
  if (path === '/auth/logout' && method === 'POST') {
    signedIn = false;
    return undefined;
  }
  if (path === '/auth/google') {
    signedIn = true;
    return undefined;
  }
  if (!signedIn) throw unauthorised();

  if (path === '/api/me') return { user };
  if (path === '/api/settings' && method === 'PATCH') {
    const patch = bodyOf<Partial<User>>(body);
    if (patch.defaultCurrency !== undefined) user.defaultCurrency = patch.defaultCurrency;
    if (patch.showUsdEquivalent !== undefined) user.showUsdEquivalent = patch.showUsdEquivalent;
    if (patch.theme !== undefined) user.theme = patch.theme;
    if (patch.monthlyBudgetMinor !== undefined) user.monthlyBudgetMinor = patch.monthlyBudgetMinor;
    return { user };
  }

  if (path === '/api/summary')
    return summaryFor(q.get('month') ?? monthOf(new Date().toISOString()));

  if (seg[1] === 'transactions') {
    const id = seg[2];
    if (!id && method === 'GET') {
      let list = [...transactions].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      const month = q.get('month');
      const text = q.get('q')?.trim().toLowerCase();
      const categoryId = q.get('categoryId');
      const accountId = q.get('accountId');
      const type = q.get('type');
      const before = q.get('before');
      const limit = Math.max(1, Math.min(500, Number(q.get('limit') ?? 100)));
      if (month) list = list.filter((t) => monthOf(t.occurredAt) === month);
      if (text)
        list = list.filter((t) =>
          [t.userDescription, t.counterpartyName, t.bankDescription]
            .filter(Boolean)
            .some((s) => s!.toLowerCase().includes(text)),
        );
      if (categoryId === 'none') list = list.filter((t) => !t.categoryId);
      else if (categoryId) list = list.filter((t) => t.categoryId === categoryId);
      if (accountId) list = list.filter((t) => t.accountId === accountId);
      if (type) list = list.filter((t) => t.type === type);
      if (q.get('unsure') === 'true') list = list.filter((t) => t.unsureTransfer);
      if (before) list = list.filter((t) => t.occurredAt < before);
      const page = list.slice(0, limit);
      return { transactions: page.map(view), hasMore: list.length > limit };
    }
    if (!id && method === 'POST') {
      const b = bodyOf<{
        accountId: string;
        occurredAt: string;
        type: TransactionType;
        amountMinor: number;
        currency: Currency;
        userDescription: string;
        categoryId?: string | null;
        counterpartyName?: string | null;
      }>(body);
      if (!accounts.some((a) => a.id === b.accountId)) throw notFound('Account');
      const t = tx(nextId('t'), b.occurredAt, b.type, b.amountMinor, b.accountId, {
        currency: b.currency,
        userDescription: b.userDescription,
        categoryId: b.categoryId ?? null,
        payee: b.counterpartyName ?? null,
        source: 'manual',
        createdAt: new Date().toISOString(),
      });
      transactions.push(t);
      return { transaction: view(t) };
    }
    const t = transactions.find((x) => x.id === id);
    if (!t) throw notFound('Transaction');
    if (method === 'GET') return { transaction: view(t) };
    if (method === 'PATCH') {
      const b = bodyOf<{
        categoryId?: string | null;
        rememberForPayee?: boolean;
        userDescription?: string | null;
        type?: TransactionType;
      }>(body);
      if (b.categoryId !== undefined) {
        if (b.categoryId && !categories.some((c) => c.id === b.categoryId))
          throw notFound('Category');
        t.categoryId = b.categoryId;
        if (b.rememberForPayee && t.counterpartyName) {
          if (b.categoryId) payeeRules.set(t.counterpartyName, b.categoryId);
          else payeeRules.delete(t.counterpartyName);
        }
      }
      if (b.userDescription !== undefined) t.userDescription = b.userDescription?.trim() || null;
      if (b.type !== undefined) t.unsureTransfer = false;
      if (b.type !== undefined && b.type !== t.type) {
        const pair = t.transferGroupId
          ? transactions.find((x) => x.transferGroupId === t.transferGroupId && x.id !== t.id)
          : undefined;
        if (b.type === 'transfer' && !t.transferGroupId) t.transferGroupId = nextId('g');
        t.type = b.type;
        if (pair && b.type !== 'transfer') {
          pair.type =
            pair.type === 'transfer' ? (t.type === 'expense' ? 'income' : 'expense') : pair.type;
        }
      }
      return { transaction: view(t) };
    }
    if (method === 'DELETE') {
      if (t.source === 'alert')
        throw new ApiError(409, 'cannot_delete', 'Transactions from alerts cannot be deleted');
      transactions.splice(transactions.indexOf(t), 1);
      return undefined;
    }
  }

  if (seg[1] === 'categories') {
    const id = seg[2];
    if (!id && method === 'GET')
      return { categories: [...categories].sort((a, b) => a.sortOrder - b.sortOrder) };
    if (!id && method === 'POST') {
      const { name } = bodyOf<{ name: string }>(body);
      const trimmed = name?.trim();
      if (!trimmed) throw new ApiError(400, 'bad_request', 'A category needs a name');
      if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase()))
        throw new ApiError(409, 'duplicate', `"${trimmed}" already exists`);
      const c: Category = { id: nextId('c'), name: trimmed, sortOrder: categories.length };
      categories.push(c);
      return { category: c };
    }
    const c = categories.find((x) => x.id === id);
    if (!c) throw notFound('Category');
    if (method === 'PATCH') {
      const b = bodyOf<{ name?: string; sortOrder?: number }>(body);
      if (b.name !== undefined) c.name = b.name.trim();
      if (b.sortOrder !== undefined) c.sortOrder = b.sortOrder;
      return { category: c };
    }
    if (method === 'DELETE') {
      categories.splice(categories.indexOf(c), 1);
      for (const t of transactions) if (t.categoryId === c.id) t.categoryId = null;
      for (const [k, v] of payeeRules) if (v === c.id) payeeRules.delete(k);
      return undefined;
    }
  }

  if (seg[1] === 'accounts') {
    const id = seg[2];
    if (!id && method === 'GET') return { accounts };
    if (!id && method === 'POST') {
      const b = bodyOf<{
        bank: Bank;
        name: string;
        accountNumber?: string | null;
        currency?: Currency;
        isOwn?: boolean;
      }>(body);
      const a: Account = {
        id: nextId('a'),
        bank: b.bank,
        name: b.name?.trim() || BANK_LABELS[b.bank],
        accountNumber: b.accountNumber ?? null,
        currency: b.currency ?? 'NGN',
        isOwn: b.isOwn ?? true,
        tracked: false,
        trackingFrom: null,
        status: 'off',
        lastBalanceMinor: null,
        lastBalanceAt: null,
        lastAlertAt: null,
      };
      accounts.push(a);
      return { account: a };
    }
    const a = accounts.find((x) => x.id === id);
    if (!a) throw notFound('Account');
    if (method === 'PATCH') {
      const b = bodyOf<{
        name?: string;
        accountNumber?: string | null;
        isOwn?: boolean;
        tracked?: boolean;
      }>(body);
      if (b.name !== undefined) a.name = b.name;
      if (b.accountNumber !== undefined) a.accountNumber = b.accountNumber;
      if (b.isOwn !== undefined) a.isOwn = b.isOwn;
      if (b.tracked !== undefined && b.tracked !== a.tracked) {
        a.tracked = b.tracked;
        if (b.tracked) {
          a.trackingFrom = new Date().toISOString();
          a.status = a.lastAlertAt ? 'tracking' : 'waiting';
        } else {
          a.status = 'off';
        }
      }
      return { account: a };
    }
    if (method === 'DELETE') {
      if (transactions.some((t) => t.accountId === a.id))
        throw new ApiError(409, 'has_transactions', 'This account still has transactions');
      accounts.splice(accounts.indexOf(a), 1);
      return undefined;
    }
  }

  if (path === '/api/alerts') return { alerts };

  if (path === '/api/rates' || path === '/api/rates/refresh') {
    const day = q.get('day') ?? new Date().toISOString().slice(0, 10);
    const rates: FxRate[] = (['NGN', 'GBP', 'EUR'] as Currency[]).map((currency) => ({
      day,
      currency,
      perUsd: PER_USD[currency],
      source: 'mock',
    }));
    return { rates };
  }

  if (path === '/api/imports/preview' && method === 'POST') {
    const b = bodyOf<ImportPreviewRequest>(body);
    if (!accounts.some((a) => a.id === b.accountId)) throw notFound('Account');
    const { columns, rows } = parseImport(b.format, b.content);
    if (columns.length === 0)
      throw new ApiError(400, 'empty_file', 'No rows could be read from the file');
    const suggestedMapping = guessMapping(columns);
    const dateCol = Object.entries(suggestedMapping.columns).find(([, f]) => f === 'date')?.[0];
    const dateAmbiguous = dateCol ? rows.some((r) => isAmbiguousDate(r[dateCol] ?? '')) : false;
    const res: ImportPreviewResponse = {
      columns,
      sampleRows: rows.slice(0, 5),
      rowCount: rows.length,
      suggestedMapping,
      dateAmbiguous,
    };
    return res;
  }
  if (path === '/api/imports' && method === 'POST') {
    const b = bodyOf<ImportCommitRequest>(body);
    const account = accounts.find((a) => a.id === b.accountId);
    if (!account) throw notFound('Account');
    const { rows } = parseImport(b.format, b.content);
    const parsed = rowsToTransactions(rows, b.mapping);
    let added = 0;
    let skipped = 0;
    for (const p of parsed.ok) {
      const dup = transactions.some(
        (t) =>
          t.accountId === account.id &&
          t.amountMinor === p.amountMinor &&
          dayOf(t.occurredAt) === dayOf(p.occurredAt) &&
          (p.reference ? t.bankReference === p.reference : t.type === p.type),
      );
      if (dup) {
        skipped++;
        continue;
      }
      transactions.push(
        tx(nextId('t'), p.occurredAt, p.type, p.amountMinor, account.id, {
          currency: account.currency,
          payee: p.counterparty,
          bankDescription: p.description,
          bankReference: p.reference,
          source: 'import',
          categoryId: p.counterparty ? (payeeRules.get(p.counterparty) ?? null) : null,
          createdAt: new Date().toISOString(),
        }),
      );
      added++;
    }
    return { importId: nextId('imp'), added, skipped, errors: parsed.errors };
  }

  throw new ApiError(404, 'not_found', `No mock for ${method} ${path}`);
}

function parseImport(
  format: 'csv' | 'json',
  content: string,
): { columns: string[]; rows: Record<string, string>[] } {
  if (format === 'json') {
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      throw new ApiError(400, 'bad_json', 'The file is not valid JSON');
    }
    const list = Array.isArray(data)
      ? data
      : data && typeof data === 'object'
        ? (Object.values(data).find(Array.isArray) ?? [])
        : [];
    const rows = (list as unknown[])
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? '' : String(v)])),
      );
    const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    return { columns, rows };
  }
  return parseCsv(content);
}

function isAmbiguousDate(value: string): boolean {
  const m = value.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a <= 12 && b <= 12 && a !== b;
}

export type { ImportField, ImportMapping, DateOrder };
