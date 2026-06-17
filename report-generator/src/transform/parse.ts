import { readXlsx } from '../xlsx';
import type { NormalizedReport, RawExport } from '../types';

/**
 * (3) parseAndNormalize — lê o arquivo Excel (.xlsx) exportado e normaliza.
 *
 * Normalização aplicada:
 *  - trim em cabeçalhos e valores;
 *  - remoção de linhas totalmente vazias.
 * `sheet` (opcional) escolhe a aba a parsear; por padrão, a primeira.
 * Ajuste aqui regras específicas do seu layout WebI (tipos, datas, totais).
 */
export async function parseAndNormalize(raw: RawExport, sheet?: string): Promise<NormalizedReport> {
  const { columns, rows } = await readXlsx(raw.filePath, sheet);

  const normColumns = columns.map((c) => c.trim());
  const normRows = rows
    .map((row) => {
      const out: Record<string, string> = {};
      for (const col of normColumns) {
        out[col] = (row[col] ?? '').trim();
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
