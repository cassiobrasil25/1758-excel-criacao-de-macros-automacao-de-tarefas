import { readXlsx, readXlsxAllSheets } from '../xlsx';
import type { NormalizedReport, RawExport } from '../types';

/**
 * (3) parseAndNormalize — lê uma aba do arquivo Excel (.xlsx) exportado.
 * `sheet` (opcional) escolhe a aba; por padrão, a primeira.
 */
export async function parseAndNormalize(raw: RawExport, sheet?: string): Promise<NormalizedReport> {
  const { columns, rows } = await readXlsx(raw.filePath, sheet);
  return normalize(raw, columns, rows, sheet);
}

/**
 * Lê TODAS as abas do export e normaliza cada uma — usado pelas análises
 * (regime e obrigatoriedade EFD), que podem estar em abas/provedores distintos.
 */
export async function parseAllSheets(raw: RawExport): Promise<NormalizedReport[]> {
  const sheets = await readXlsxAllSheets(raw.filePath);
  return sheets.map((s) => normalize(raw, s.columns, s.rows, s.name));
}

/**
 * Normalização: trim em cabeçalhos e valores; remove linhas totalmente vazias.
 * Ajuste aqui regras específicas do seu layout WebI (tipos, datas, totais).
 */
function normalize(
  raw: RawExport,
  columns: string[],
  rows: Record<string, string>[],
  sheet?: string,
): NormalizedReport {
  const normColumns = columns.map((c) => c.trim());
  const normRows = rows
    .map((row) => {
      const out: Record<string, string> = {};
      for (const col of normColumns) out[col] = (row[col] ?? '').trim();
      return out;
    })
    .filter((row) => normColumns.some((c) => row[c] !== ''));

  return {
    cce: raw.cce,
    columns: normColumns,
    rows: normRows,
    generatedAt: new Date().toISOString(),
    sheet,
  };
}
