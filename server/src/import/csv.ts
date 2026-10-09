export type Table = { columns: string[]; rows: Record<string, string>[] };

export function parseCsv(content: string): Table {
  const records = readRecords(content.replace(/^﻿/, ''));
  const header = records.shift() ?? [];
  const columns = header.map((name, index) => name.trim() || `column${index + 1}`);
  const rows = records
    .filter((record) => record.some((cell) => cell.trim() !== ''))
    .map((record) => {
      const row: Record<string, string> = {};
      columns.forEach((column, index) => {
        row[column] = (record[index] ?? '').trim();
      });
      return row;
    });
  return { columns, rows };
}

function readRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}
