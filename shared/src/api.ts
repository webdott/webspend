/**
 * The WebSpend API contract.
 *
 * The server implements it, and the web dashboard, Mac app and iPhone app consume it. The Swift
 * models in `apple/WebSpendKit` mirror these shapes field for field.
 *
 * Conventions
 * - All routes live under `/api`, except the sign-in routes under `/auth`.
 * - Money is always an integer in minor units (kobo or cents) next to a currency code.
 * - Times are ISO 8601 strings with an offset. Months are `YYYY-MM`. Days are `YYYY-MM-DD`.
 * - Authentication is a bearer token (`Authorization: Bearer <token>`) or the `ws_session`
 *   cookie the web app receives after sign-in. Both are the same session token.
 * - Errors are `{ error: { code: string; message: string } }` with a 4xx or 5xx status.
 */

export type Currency = 'NGN' | 'USD' | 'GBP' | 'EUR';
export const CURRENCIES: readonly Currency[] = ['NGN', 'USD', 'GBP', 'EUR'];

export type Bank = 'grey' | 'opay' | 'moniepoint' | 'gtbank' | 'uba' | 'cash' | 'other';
export const TRACKED_BANKS: readonly Bank[] = ['grey', 'opay', 'moniepoint', 'gtbank', 'uba'];

export const BANK_LABELS: Record<Bank, string> = {
  grey: 'Grey',
  opay: 'OPay',
  moniepoint: 'Moniepoint',
  gtbank: 'GTBank',
  uba: 'UBA',
  cash: 'Cash',
  other: 'Other',
};

export type TransactionType = 'expense' | 'income' | 'transfer';
export type TransactionSource = 'alert' | 'import' | 'manual';
export type Theme = 'auto' | 'light' | 'dark';

/**
 * Where an account is in the setup checklist.
 * - `off`: tracking is switched off, alerts are not read.
 * - `waiting`: tracking is on but no alert has arrived since it was switched on.
 * - `tracking`: at least one alert has been logged.
 */
export type AccountStatus = 'off' | 'waiting' | 'tracking';

export type User = {
  id: string;
  email: string;
  defaultCurrency: Currency;
  /** Show the US dollar equivalent beside amounts. Ignored when `defaultCurrency` is USD. */
  showUsdEquivalent: boolean;
  theme: Theme;
  /** Monthly budget in `defaultCurrency` minor units. Null when no budget is set. */
  monthlyBudgetMinor: number | null;
};

export type Account = {
  id: string;
  bank: Bank;
  name: string;
  /** Full or masked account number as the user entered it, or null for Grey and cash. */
  accountNumber: string | null;
  currency: Currency;
  /** On the "my accounts" list: money moving to or from it is a transfer to self. */
  isOwn: boolean;
  /** Alerts are read for this account. Only meaningful for `TRACKED_BANKS`. */
  tracked: boolean;
  /** Alerts received before this time are ignored. Set when tracking is switched on. */
  trackingFrom: string | null;
  status: AccountStatus;
  lastBalanceMinor: number | null;
  lastBalanceAt: string | null;
  lastAlertAt: string | null;
};

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
};

export type Transaction = {
  id: string;
  occurredAt: string;
  type: TransactionType;
  /** Always positive. `type` says which way the money went. */
  amountMinor: number;
  currency: Currency;
  /**
   * The amount in the user's default currency using the rate from the transaction's own day.
   * Equal to `amountMinor` when `currency` is the default. Null when no rate is known yet.
   */
  defaultMinor: number | null;
  defaultCurrency: Currency;
  /** The US dollar equivalent, or null when no rate is known. Equal to `amountMinor` for USD. */
  usdMinor: number | null;
  /** Units of `currency` per one US dollar on the transaction's day, or null. */
  fxPerUsd: number | null;
  accountId: string;
  accountName: string;
  bank: Bank;
  /**
   * What the apps show as the headline: the user's title, else their description, else the
   * payee, else the bank text.
   */
  title: string;
  /** The headline the user typed, or null while `title` is one of the fallbacks. */
  userTitle: string | null;
  counterpartyName: string | null;
  counterpartyBank: string | null;
  counterpartyAccount: string | null;
  bankDescription: string | null;
  userDescription: string | null;
  categoryId: string | null;
  categoryName: string | null;
  source: TransactionSource;
  bankReference: string | null;
  /** Shared by both legs of a transfer to self. */
  transferGroupId: string | null;
  /** True for an exchange loss WebSpend added itself when pairing a conversion. */
  isFee: boolean;
  /**
   * True when the other account matches one of the user's own by its last digits only, so this
   * may be a transfer to self. Counted as its `type` until the user re-marks it, which clears it.
   */
  unsureTransfer: boolean;
  createdAt: string;
};

export type CategoryTotal = {
  categoryId: string | null;
  name: string;
  /** In the user's default currency. */
  minor: number;
  usdMinor: number | null;
  count: number;
};

export type Summary = {
  month: string;
  currency: Currency;
  budgetMinor: number | null;
  spentMinor: number;
  incomeMinor: number;
  /** `budgetMinor - spentMinor`, or null when no budget is set. */
  leftMinor: number | null;
  spentUsdMinor: number | null;
  incomeUsdMinor: number | null;
  leftUsdMinor: number | null;
  /**
   * Income minus spending across every month before this one: what the month started with.
   * Negative when earlier months spent more than came in.
   */
  carryOverMinor: number;
  /** `carryOverMinor + incomeMinor - spentMinor`: what is on hand once this month is counted. */
  availableMinor: number;
  carryOverUsdMinor: number | null;
  availableUsdMinor: number | null;
  /** Units of the default currency per one US dollar today, or null if USD is the default. */
  todayPerUsd: number | null;
  byCategory: CategoryTotal[];
  uncategorisedCount: number;
  lastAlertAt: string | null;
  trackedBanks: Bank[];
};

export type RawAlertStatus =
  | 'parsed'
  | 'unknown_sender'
  | 'not_a_transaction'
  | 'unrecognised_layout'
  | 'before_tracking_from'
  | 'failed_authentication'
  | 'duplicate';

export type RawAlert = {
  id: string;
  receivedAt: string;
  sender: string;
  subject: string;
  status: RawAlertStatus;
  detail: string | null;
  transactionId: string | null;
};

export type FxRate = {
  day: string;
  currency: Currency;
  perUsd: number;
  source: string;
};

export type Meta = {
  version: string;
  googleAuth: boolean;
  devAuth: boolean;
};

/** GET /api/meta */
export type MetaResponse = Meta;

/**
 * GET /auth/google?client=web|mac|iphone
 * Redirects to Google. After consent, `web` lands on the dashboard with the cookie set; `mac`
 * and `iphone` land on `webspend://signed-in#token=<session token>`.
 *
 * POST /auth/dev  { email }  (dev only)  → SessionResponse
 * POST /auth/logout → 204
 */
export type DevSignInRequest = { email: string };
export type SessionResponse = { token: string; user: User };

/** GET /api/me */
export type MeResponse = { user: User };

/** PATCH /api/settings */
export type UpdateSettingsRequest = Partial<
  Pick<User, 'defaultCurrency' | 'showUsdEquivalent' | 'theme' | 'monthlyBudgetMinor'>
>;
export type UpdateSettingsResponse = { user: User };

/** GET /api/summary?month=YYYY-MM (defaults to the current month) */
export type SummaryResponse = Summary;

/**
 * GET /api/transactions
 *   ?month=YYYY-MM      limit to one month
 *   &q=text             search title, descriptions and payee
 *   &categoryId=id      one category, or `none` for uncategorised
 *   &accountId=id
 *   &type=expense|income|transfer
 *   &unsure=true        only transactions tagged `unsureTransfer`
 *   &limit=100&before=<occurredAt of the last item seen>
 * Sorted newest first. Clients group by day.
 */
export type TransactionsResponse = { transactions: Transaction[]; hasMore: boolean };

/** GET /api/transactions/:id */
export type TransactionResponse = { transaction: Transaction };

/** PATCH /api/transactions/:id */
export type UpdateTransactionRequest = {
  /** The headline. Null or blank goes back to the fallback title. */
  title?: string | null;
  /** Moving the date re-stamps the exchange rate with that day's. */
  occurredAt?: string;
  amountMinor?: number;
  counterpartyName?: string | null;
  categoryId?: string | null;
  /** Save `categoryId` for this payee so future alerts from them are categorised. */
  rememberForPayee?: boolean;
  userDescription?: string | null;
  /**
   * Re-mark the transaction. Moving to or from `transfer` also updates its paired leg. Sending
   * the type it already has confirms it and clears `unsureTransfer`.
   */
  type?: TransactionType;
};
export type UpdateTransactionResponse = { transaction: Transaction };

/** POST /api/transactions  (manual entry, for cash) */
export type CreateTransactionRequest = {
  accountId: string;
  occurredAt: string;
  type: TransactionType;
  amountMinor: number;
  currency: Currency;
  userDescription: string;
  categoryId?: string | null;
  counterpartyName?: string | null;
};
export type CreateTransactionResponse = { transaction: Transaction };

/** DELETE /api/transactions/:id → 204. Any transaction, including one logged from an alert. */

/** GET /api/categories */
export type CategoriesResponse = { categories: Category[] };
/** POST /api/categories */
export type CreateCategoryRequest = { name: string };
/** PATCH /api/categories/:id */
export type UpdateCategoryRequest = { name?: string; sortOrder?: number };
export type CategoryResponse = { category: Category };
/** DELETE /api/categories/:id → 204. Transactions in it become uncategorised. */

/** GET /api/accounts */
export type AccountsResponse = { accounts: Account[] };
/** POST /api/accounts */
export type CreateAccountRequest = {
  bank: Bank;
  name: string;
  accountNumber?: string | null;
  currency?: Currency;
  isOwn?: boolean;
};
/** PATCH /api/accounts/:id. Setting `tracked: true` stamps `trackingFrom` with now. */
export type UpdateAccountRequest = {
  name?: string;
  accountNumber?: string | null;
  isOwn?: boolean;
  tracked?: boolean;
};
export type AccountResponse = { account: Account };
/** DELETE /api/accounts/:id → 204. Refused (409) while it has transactions. */

/** GET /api/alerts?status=failed  — alerts that could not be turned into transactions */
export type AlertsResponse = { alerts: RawAlert[] };

/** GET /api/rates?day=YYYY-MM-DD (defaults to today) */
export type RatesResponse = { rates: FxRate[] };
/** POST /api/rates/refresh → RatesResponse. Fetches today's rates now. */

export type ImportFormat = 'csv' | 'json';

/**
 * Send as `accountId` to import a file that belongs to no particular account. The rows are kept
 * under a catch-all account named "Unassigned", created the first time it is needed.
 */
export const NO_ACCOUNT = 'none';

export type ImportField =
  | 'date'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'description'
  | 'counterparty'
  | 'category'
  | 'reference'
  | 'balance'
  | 'ignore';

export const IMPORT_FIELDS: readonly ImportField[] = [
  'date',
  'amount',
  'debit',
  'credit',
  'description',
  'counterparty',
  'category',
  'reference',
  'balance',
  'ignore',
];

/** How to read day and month when a date like 03/04/2026 could be either. */
export type DateOrder = 'dmy' | 'mdy' | 'ymd';

export type ImportMapping = {
  /** Column name (CSV header or JSON key) → field. Columns left out are ignored. */
  columns: Record<string, ImportField>;
  dateOrder: DateOrder;
  /** Sign convention when a single `amount` column is used. */
  negativeIsExpense: boolean;
};

/**
 * POST /api/imports/preview  { accountId, format, content }
 * Parses the file, guesses a mapping and says whether any dates are ambiguous.
 */
export type ImportPreviewRequest = { accountId: string; format: ImportFormat; content: string };
export type ImportPreviewResponse = {
  columns: string[];
  sampleRows: Record<string, string>[];
  rowCount: number;
  suggestedMapping: ImportMapping;
  dateAmbiguous: boolean;
};

/**
 * POST /api/imports  Commits the import. Rows matching an existing transaction are skipped.
 * When a `category` column is mapped, names not on the user's list are added to it, new rows
 * are filed under their category, and a skipped row hands its category to the transaction it
 * matches if that one has none.
 */
export type ImportCommitRequest = {
  accountId: string;
  format: ImportFormat;
  content: string;
  mapping: ImportMapping;
};
export type ImportCommitResponse = {
  importId: string;
  added: number;
  skipped: number;
  /** Categories added to the user's list by this import. */
  categoriesCreated: number;
  /** Transactions already in the ledger that this import gave a category. */
  categorised: number;
  /** Row numbers (1-based, excluding the header) that could not be read, with the reason. */
  errors: { row: number; reason: string }[];
};

/**
 * POST /api/intake/email
 * Headers: `X-Intake-Secret: <INTAKE_SECRET>`. The forwarding-address path into the same
 * pipeline the Gmail poller uses. `authenticated` must only be set true by a trusted relay that
 * verified SPF and DKIM itself.
 */
export type IntakeEmailRequest = {
  userEmail: string;
  messageId: string;
  from: string;
  subject: string;
  text: string;
  receivedAt: string;
  authenticated: boolean;
};
export type IntakeEmailResponse = { alert: RawAlert };

// Export ----------------------------------------------------------------------------------------

export type ExportFormat = 'csv' | 'pdf';

/**
 * GET /api/exports?format=csv|pdf&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   &accountId=id&categoryId=id|none&type=expense|income|transfer
 *
 * Downloads the transactions between `from` and `to`, Lagos calendar days, both inclusive. `to`
 * defaults to today and `from` to the first day of `to`'s month. The reply is the file itself,
 * with `Content-Disposition: attachment; filename="webspend-<from>-to-<to>.<format>"`.
 *
 * CSV: UTF-8 with a byte-order mark so spreadsheets read the naira sign. One row per transaction,
 * newest first. Columns: Date, Time, Type, Title, Description, Category, Account, Bank, Amount,
 * Currency, Amount in the default currency, USD equivalent, Counterparty, Reference, Source.
 * Amounts are plain decimals (18500.00); expenses negative, income positive, transfers to self
 * unsigned.
 *
 * PDF: the same rows as a table, with the range's spent, income and net totals at the top.
 * Transfers to self are listed but left out of the totals.
 */
export type ExportQuery = {
  format: ExportFormat;
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
};

export type ApiError = { error: { code: string; message: string } };
