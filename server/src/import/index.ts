import type { ImportPreviewRequest, ImportPreviewResponse } from '@webspend/shared';
import { suggestMapping } from './mapping.ts';
import { readTable } from './table.ts';

export { commitImport } from './commit.ts';

const SAMPLE_ROWS = 5;

export function previewImport(request: ImportPreviewRequest): ImportPreviewResponse {
  const table = readTable(request.format, request.content);
  const { mapping, dateAmbiguous } = suggestMapping(table);
  return {
    columns: table.columns,
    sampleRows: table.rows.slice(0, SAMPLE_ROWS),
    rowCount: table.rows.length,
    suggestedMapping: mapping,
    dateAmbiguous,
  };
}
