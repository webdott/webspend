import type { Context } from 'hono';
import type { ZodType } from 'zod';
import type { ApiError } from '@webspend/shared';
import { LedgerError } from '../ledger/errors.ts';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function parseBody<T>(c: Context, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HttpError(400, 'invalid_request', 'expected a JSON body');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new HttpError(400, 'invalid_request', `${where}${issue?.message ?? 'invalid body'}`);
  }
  return result.data;
}

export function errorBody(error: unknown): { status: number; body: ApiError } {
  if (error instanceof HttpError || error instanceof LedgerError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message } } };
  }
  console.error(error);
  return { status: 500, body: { error: { code: 'internal', message: 'something went wrong' } } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids are uuids; anything else cannot exist, so it is a 404 rather than a database error. */
export function requireUuid(value: string | null | undefined, what: string): string {
  if (!value || !UUID.test(value)) throw new HttpError(404, 'not_found', `${what} not found`);
  return value;
}
