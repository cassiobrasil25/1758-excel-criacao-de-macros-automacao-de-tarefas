import * as fs from 'fs';
import * as path from 'path';
import { readXlsx, writeXlsx } from '../xlsx';
import { normalizeKey, type RegimeTransition } from '../transform/regime';

const COL_SAIDA = 'Data Saida Simples Nacional';
const COL_EFD = 'Data Obrigatoriedade EFD';

export interface LevantamentoResult {
  xlsx: string;
  totalRows: number;
  matched: number;
}

/**
 * Lê a planilha de origem (ex.: Levantamento de Autos), repassa TODAS as suas
 * colunas e acrescenta duas: a data em que a empresa passou a ser obrigada à
 * EFD e a data em que deixou o Simples Nacional. O casamento é feito por um
 * identificador (CNPJ por padrão), normalizado para dígitos.
 *
 * Se o arquivo de origem não existir, retorna null (pipeline segue sem erro).
 */
export async function buildLevantamentoReport(
  sourcePath: string,
  joinKey: string,
  byCompany: Map<string, RegimeTransition>,
  outDir: string,
  sheet?: string,
): Promise<LevantamentoResult | null> {
  if (!fs.existsSync(sourcePath)) return null;

  const { columns, rows } = await readXlsx(sourcePath, sheet);
  if (columns.length === 0) return null;

  const joinCol = resolveJoinCol(columns, joinKey);
  const outColumns = [...columns, COL_SAIDA, COL_EFD];

  let matched = 0;
  const outRows = rows.map((row) => {
    const out: Record<string, string> = { ...row };
    const key = joinCol ? normalizeKey(row[joinCol] ?? '') : '';
    const info = key ? byCompany.get(key) : undefined;
    if (info) matched++;
    out[COL_SAIDA] = info?.dataSaidaSimples ?? '';
    out[COL_EFD] = info?.dataObrigatoriedadeEFD ?? '';
    return out;
  });

  const xlsx = path.join(outDir, 'levantamento-com-datas.xlsx');
  await writeXlsx(xlsx, [{ name: 'Levantamento', columns: outColumns, rows: outRows }]);

  return { xlsx, totalRows: rows.length, matched };
}

function resolveJoinCol(columns: string[], joinKey: string): string | undefined {
  if (columns.includes(joinKey)) return columns.find((c) => c === joinKey);
  const lower = columns.find((c) => c.toLowerCase() === joinKey.toLowerCase());
  if (lower) return lower;
  for (const re of [/cnpj/i, /n[uú]mero\s*de\s*inscri/i, /inscri/i, /cce/i]) {
    const c = columns.find((col) => re.test(col));
    if (c) return c;
  }
  return undefined;
}
