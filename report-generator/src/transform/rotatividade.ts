import type { NormalizedReport } from '../types';

export interface RotatividadeOptions {
  /** Identificador da empresa (ex.: "CCE"). */
  companyKey: string;
  /** Coluna de período (para escolher estoque inicial/final por data). */
  periodField: string;
  /** Coluna do estoque inicial. */
  estoqueInicialField: string;
  /** Coluna das entradas (somadas no período). */
  entradasField: string;
  /** Coluna do estoque final. */
  estoqueFinalField: string;
  /** Coluna das saídas (somadas no período). */
  saidasField: string;
  /** Tolerância (em valor) para considerar a equação fechada. */
  tolerance: number;
}

export interface RotatividadeRow {
  cce: string;
  razaoSocial: string;
  estoqueInicial: number;
  entradas: number;
  estoqueFinal: number;
  saidas: number;
  /** Estoque Inicial + Entradas. */
  esperado: number;
  /** Estoque Final + Saídas. */
  realizado: number;
  /** esperado - realizado (0 = equação fecha). */
  diferenca: number;
  status: 'OK' | 'DIVERGENTE';
}

interface Acc {
  razao: string;
  entradas: number;
  saidas: number;
  ei?: { period: number; val: number };
  ef?: { period: number; val: number };
}

/**
 * Auditoria 12.02 — rotatividade (de estoque). Por CCE, verifica a equação:
 *   Estoque Inicial + Entradas = Estoque Final + Saídas.
 * Entradas/Saídas são somadas no período; Estoque Inicial/Final são tomados,
 * respectivamente, no menor e no maior período observado. Divergência indica
 * inconsistência (indício para auditoria).
 */
export function detectRotatividade(
  reports: NormalizedReport[],
  opts: RotatividadeOptions,
): RotatividadeRow[] {
  const byCompany = new Map<string, Acc>();
  const singleEstoque = opts.estoqueInicialField === opts.estoqueFinalField;

  for (const report of reports) {
    const cols = report.columns;
    const companyCol = resolveCol(cols, opts.companyKey, [
      /cce/i,
      /cnpj/i,
      /n[uú]mero\s*de\s*inscri/i,
    ]);
    if (!companyCol) continue;
    const periodCol = resolveCol(cols, opts.periodField, [/ano\s*\/?\s*m[eê]s/i, /per[ií]odo/i, /ano/i]);
    const eiCol = resolveCol(cols, opts.estoqueInicialField, [/estoque\s*inicial/i, /^estoque/i]);
    const efCol = resolveCol(cols, opts.estoqueFinalField, [/estoque\s*final/i, /^estoque/i]);
    const entCol = resolveCol(cols, opts.entradasField, [/entrada/i]);
    const saiCol = resolveCol(cols, opts.saidasField, [/sa.da/i]);
    const razaoCol = resolveCol(cols, 'Razao Social', [/raz.o\s*social/i, /nome\s*empres/i]);

    for (const row of report.rows) {
      const company = (row[companyCol] ?? '').trim();
      if (!company) continue;
      const acc = byCompany.get(company) ?? { razao: '', entradas: 0, saidas: 0 };
      if (!acc.razao && razaoCol) acc.razao = (row[razaoCol] ?? '').trim();
      const period = parsePeriod(periodCol ? row[periodCol] : undefined);

      if (entCol) acc.entradas += parseNum(row[entCol]);
      if (saiCol) acc.saidas += parseNum(row[saiCol]);

      if (eiCol && (row[eiCol] ?? '') !== '') {
        const val = parseNum(row[eiCol]);
        if (!acc.ei || period < acc.ei.period) acc.ei = { period, val };
      }
      const efSource = singleEstoque ? eiCol : efCol;
      if (efSource && (row[efSource] ?? '') !== '') {
        const val = parseNum(row[efSource]);
        if (!acc.ef || period > acc.ef.period) acc.ef = { period, val };
      }

      byCompany.set(company, acc);
    }
  }

  const out: RotatividadeRow[] = [];
  for (const [cce, acc] of byCompany) {
    const estoqueInicial = acc.ei?.val ?? 0;
    const estoqueFinal = acc.ef?.val ?? 0;
    const esperado = round2(estoqueInicial + acc.entradas);
    const realizado = round2(estoqueFinal + acc.saidas);
    const diferenca = round2(esperado - realizado);
    out.push({
      cce,
      razaoSocial: acc.razao,
      estoqueInicial,
      entradas: round2(acc.entradas),
      estoqueFinal,
      saidas: round2(acc.saidas),
      esperado,
      realizado,
      diferenca,
      status: Math.abs(diferenca) <= opts.tolerance ? 'OK' : 'DIVERGENTE',
    });
  }

  // Divergentes (maiores diferenças) primeiro.
  return out.sort(
    (a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca) || a.cce.localeCompare(b.cce),
  );
}

function resolveCol(columns: string[], preferred: string, regexes: RegExp[]): string | undefined {
  if (columns.includes(preferred)) return preferred;
  const lower = columns.find((c) => c.toLowerCase() === preferred.toLowerCase());
  if (lower) return lower;
  for (const re of regexes) {
    const c = columns.find((col) => re.test(col));
    if (c) return c;
  }
  return undefined;
}

/** Converte número BR ("1.234,56") ou US ("1234.56") para float. */
function parseNum(value: string | undefined): number {
  if (!value) return 0;
  let s = value.trim().replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // BR: . milhar, , decimal
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parsePeriod(value: string | undefined): number {
  if (!value) return 0;
  const d = value.replace(/\D/g, '');
  return d ? Number(d.slice(0, 6)) : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
