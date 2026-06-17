import * as fs from 'fs';
import { parseCsv } from '../csv';
import type { NormalizedReport, RawExport } from '../types';

/**
 * (3) parseAndNormalize — lê o arquivo bruto exportado e normaliza.
 *
 * Normalização aplicada:
 *  - trim em cabeçalhos e valores;
 *  - remoção de linhas totalmente vazias.
 * Ajuste aqui regras específicas do seu layout WebI (ex.: tipos, datas, totais).
 */
export function parseAndNormalize(raw: RawExport): NormalizedReport {
  const content = fs.readFileSync(raw.filePath, 'utf8');
  const { columns, rows } = parseCsv(content);

  const normColumns = columns.map((c) => c.trim());
  const normRows = rows
    .map((row) => {
      const out: Record<string, string> = {};
      for (const col of normColumns) {
        out[col] = (row[col] ?? row[col.trim()] ?? '').trim();
      }
      return out;
    })
    .filter((row) => normColumns.some((c) => row[c] !== ''));

  return {
    cce: raw.cce,
    columns: normColumns,
    rows: normRows,
    generatedAt: new Date().toISOString(),
  };
}
