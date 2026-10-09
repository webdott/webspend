import { describe, expect, it } from 'vitest';
import {
  guessMapping,
  mappingProblems,
  parseCsv,
  parseImportAmount,
  parseImportDate,
  rowsToTransactions,
} from './importMapping.ts';

describe('parseCsv', () => {
  it('reads headers, quoted commas and CRLF', () => {
    const { columns, rows } = parseCsv(
      'Date,Narration,Debit,Credit\r\n"03/04/2026","Shoprite, Ikeja",1200.50,\r\n',
    );
    expect(columns).toEqual(['Date', 'Narration', 'Debit', 'Credit']);
    expect(rows).toEqual([
      { Date: '03/04/2026', Narration: 'Shoprite, Ikeja', Debit: '1200.50', Credit: '' },
    ]);
  });
});

describe('guessMapping', () => {
  it('maps common bank statement headers', () => {
    const m = guessMapping(['Trans Date', 'Narration', 'Debit', 'Credit', 'Balance', 'Reference']);
    expect(m.columns).toEqual({
      'Trans Date': 'date',
      Narration: 'description',
      Debit: 'debit',
      Credit: 'credit',
      Balance: 'balance',
      Reference: 'reference',
    });
    expect(mappingProblems(m)).toEqual([]);
  });

  it('flags a mapping without a date or amount', () => {
    const m = guessMapping(['Foo', 'Bar']);
    expect(mappingProblems(m)).toHaveLength(2);
  });

  it('prefers debit/credit over a signed amount when both exist', () => {
    const m = guessMapping(['Date', 'Amount', 'Debit', 'Credit']);
    expect(m.columns['Amount']).toBe('ignore');
  });
});

describe('parseImportDate', () => {
  it('honours day/month order', () => {
    expect(parseImportDate('03/04/2026', 'dmy')?.getMonth()).toBe(3);
    expect(parseImportDate('03/04/2026', 'mdy')?.getMonth()).toBe(2);
    expect(parseImportDate('2026-04-03T10:00', 'dmy')?.getDate()).toBe(3);
  });
  it('returns null for nonsense', () => {
    expect(parseImportDate('not a date', 'dmy')).toBeNull();
    expect(parseImportDate('', 'dmy')).toBeNull();
  });
});

describe('parseImportAmount', () => {
  it('reads currency symbols, grouping and negatives', () => {
    expect(parseImportAmount('₦1,200.50')).toBe(120050);
    expect(parseImportAmount('-1200')).toBe(-120000);
    expect(parseImportAmount('(45.00)')).toBe(-4500);
    expect(parseImportAmount('')).toBeNull();
  });
});

describe('rowsToTransactions', () => {
  it('builds transactions and reports bad rows', () => {
    const mapping = guessMapping(['Date', 'Amount', 'Description']);
    const { ok, errors } = rowsToTransactions(
      [
        { Date: '2026-10-02', Amount: '-500', Description: 'Fuel' },
        { Date: '2026-10-03', Amount: '1000', Description: 'Refund' },
        { Date: '??', Amount: '1', Description: '' },
      ],
      mapping,
    );
    expect(ok.map((t) => [t.type, t.amountMinor])).toEqual([
      ['expense', 50000],
      ['income', 100000],
    ]);
    expect(errors).toEqual([{ row: 3, reason: 'Could not read the date "??"' }]);
  });
});
