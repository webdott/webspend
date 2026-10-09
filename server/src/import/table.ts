import type { ImportFormat } from '@webspend/shared';
import { InvalidRequestError } from '../ledger/errors.ts';
import { parseCsv, type Table } from './csv.ts';
import { parseJson } from './json.ts';

export function readTable(format: ImportFormat, content: string): Table {
  try {
    return format === 'csv' ? parseCsv(content) : parseJson(content);
  } catch (error) {
    throw new InvalidRequestError((error as Error).message);
  }
}
