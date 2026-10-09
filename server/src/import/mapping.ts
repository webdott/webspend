/**
 * Guesses which column holds what from its name, and whether the dates need the user to say
 * which part is the day. Nigerian statements are day-first, so that is the default.
 */
import type { DateOrder, ImportField, ImportMapping } from '@webspend/shared';
import type { Table } from './csv.ts';
import { impliedOrder, isAmbiguousDate } from './dates.ts';

const PATTERNS: [ImportField, RegExp][] = [
  [
    'date',
    /^(trans(action)?[\s_-]*)?(date|time|datetime|timestamp|value[\s_-]*date|posted|occurred)/i,
  ],
  ['debit', /debit|withdrawal|money[\s_-]*out|outflow|paid[\s_-]*out/i],
  ['credit', /credit|deposit|money[\s_-]*in|inflow|paid[\s_-]*in|lodg?ement/i],
  ['amount', /^amount|amt|value$/i],
  ['balance', /balance|bal\b/i],
  [
    'counterparty',
    /counter[\s_-]*part|payee|beneficiary|recipient|sender|merchant|other[\s_-]*party/i,
  ],
  ['reference', /\bref(erence)?\b|txn[\s_-]*id|transaction[\s_-]*(id|no)|document/i],
  ['description', /desc|narration|details|remarks?|memo|note|particulars/i],
];

export function suggestMapping(table: Table): { mapping: ImportMapping; dateAmbiguous: boolean } {
  const columns: Record<string, ImportField> = {};
  const taken = new Set<ImportField>();
  for (const column of table.columns) {
    const field = PATTERNS.find(([name, pattern]) => !taken.has(name) && pattern.test(column))?.[0];
    if (!field) continue;
    columns[column] = field;
    taken.add(field);
  }

  const dateColumn = Object.entries(columns).find(([, field]) => field === 'date')?.[0];
  let dateOrder: DateOrder = 'dmy';
  let dateAmbiguous = false;
  if (dateColumn) {
    const values = table.rows.map((row) => row[dateColumn] ?? '');
    const implied = values.map(impliedOrder).find((order) => order !== null);
    if (implied) dateOrder = implied;
    dateAmbiguous = !implied && values.some(isAmbiguousDate);
  }

  return {
    mapping: { columns, dateOrder, negativeIsExpense: true },
    dateAmbiguous,
  };
}
