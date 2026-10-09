import { z } from 'zod';
import { CURRENCIES, IMPORT_FIELDS, TRACKED_BANKS } from './api.ts';

export const currencySchema = z.enum(CURRENCIES as [string, ...string[]]);
export const bankSchema = z.enum(['grey', 'opay', 'moniepoint', 'gtbank', 'uba', 'cash', 'other']);
export const transactionTypeSchema = z.enum(['expense', 'income', 'transfer']);
export const themeSchema = z.enum(['auto', 'light', 'dark']);
export const minorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM');
export const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const devSignInSchema = z.object({ email: z.string().email() });

export const updateSettingsSchema = z
  .object({
    defaultCurrency: currencySchema,
    showUsdEquivalent: z.boolean(),
    theme: themeSchema,
    monthlyBudgetMinor: minorSchema.nullable(),
  })
  .partial();

export const updateTransactionSchema = z
  .object({
    title: z.string().trim().max(200).nullable(),
    occurredAt: isoDateTimeSchema,
    amountMinor: minorSchema.min(1),
    counterpartyName: z.string().trim().max(200).nullable(),
    categoryId: z.string().nullable(),
    rememberForPayee: z.boolean(),
    userDescription: z.string().max(2000).nullable(),
    type: transactionTypeSchema,
  })
  .partial();

export const createTransactionSchema = z.object({
  accountId: z.string(),
  occurredAt: isoDateTimeSchema,
  type: transactionTypeSchema,
  amountMinor: minorSchema.min(1),
  currency: currencySchema,
  userDescription: z.string().min(1).max(2000),
  categoryId: z.string().nullable().optional(),
  counterpartyName: z.string().max(200).nullable().optional(),
});

export const createCategorySchema = z.object({ name: z.string().trim().min(1).max(60) });
export const updateCategorySchema = z
  .object({ name: z.string().trim().min(1).max(60), sortOrder: z.number().int().min(0) })
  .partial();

export const createAccountSchema = z.object({
  bank: bankSchema,
  name: z.string().trim().min(1).max(60),
  accountNumber: z.string().trim().max(40).nullable().optional(),
  currency: currencySchema.optional(),
  isOwn: z.boolean().optional(),
});
export const updateAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    accountNumber: z.string().trim().max(40).nullable(),
    isOwn: z.boolean(),
    tracked: z.boolean(),
  })
  .partial();

export const importFormatSchema = z.enum(['csv', 'json']);
export const importMappingSchema = z.object({
  columns: z.record(z.string(), z.enum(IMPORT_FIELDS as [string, ...string[]])),
  dateOrder: z.enum(['dmy', 'mdy', 'ymd']),
  negativeIsExpense: z.boolean(),
});
export const importPreviewSchema = z.object({
  accountId: z.string(),
  format: importFormatSchema,
  content: z.string().min(1).max(10_000_000),
});
export const importCommitSchema = importPreviewSchema.extend({
  mapping: importMappingSchema,
});

export const intakeEmailSchema = z.object({
  userEmail: z.string().email(),
  messageId: z.string().min(1),
  from: z.string().min(1),
  subject: z.string(),
  text: z.string(),
  receivedAt: isoDateTimeSchema,
  authenticated: z.boolean(),
});

export const exportQuerySchema = z
  .object({
    format: z.enum(['csv', 'pdf']),
    from: daySchema.optional(),
    to: daySchema.optional(),
    accountId: z.string().optional(),
    categoryId: z.string().optional(),
    type: transactionTypeSchema.optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'from must not be after to',
  });

export const trackedBanks = TRACKED_BANKS;
