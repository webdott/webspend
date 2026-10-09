import type { Table } from './csv.ts';

/** Accepts an array of flat objects or `{ transactions: [...] }`. Values become strings. */
export function parseJson(content: string): Table {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('the file is not valid JSON');
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { transactions?: unknown }).transactions)
      ? (parsed as { transactions: unknown[] }).transactions
      : null;
  if (!list) throw new Error('expected an array of objects or { "transactions": [...] }');

  const columns: string[] = [];
  const rows = list.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('every item must be an object');
    }
    const row: Record<string, string> = {};
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
      if (!columns.includes(key)) columns.push(key);
      row[key] = value === null || value === undefined ? '' : String(value).trim();
    }
    return row;
  });
  return { columns, rows };
}
