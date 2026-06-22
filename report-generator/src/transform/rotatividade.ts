import type { NormalizedReport } from '../types';

export interface RotatividadeOptions {
  /** Identificador da empresa (ex.: "CCE"). */
  companyKey: string;
  /** Coluna de período (para escolher estoque inicial/final por data). */
  periodField: string;
  /** Coluna do estoque inicial. */
  estoqueInicialField: string;
  /** Coluna das compras/entradas (somadas no período) — aba 01 ENTRADAS. */
  comprasField: string;
  /** Coluna do estoque final. */
  estoqueFinalField: string;
  /** Coluna das saídas (somadas no período) — aba 08 SAÍDAS. */
  saidasField: string;
  /** Tolerância (em valor) para considerar CMV ≈ Saídas. */
  tolerance: number;
}

export interface RotatividadeRow {
  cce: string;
  razaoSocial: string;
  estoqueInicial: number;
  compras: number;
  estoqueFinal: number;
  /** CMV = Estoque Inicial + Compras − Estoque Final. */
  cmv: number;
  saidas: number;
  /** CMV − Saídas (no modelo EI+Compras=EF+Saídas, deveria ser 0). */
  diferenca: number;
  /** OK / DIVERGENTE quando há saídas p/ comparar; CALCULADO se só há CMV. */
  status: 'OK' | 'DIVERGENTE' | 'CALCULADO';
}

interface Acc {
  razao: string;
  compras: number;
  saidas: number;
  temSaidas: boolean;
  ei?: { period: number; val: number };
  ef?: { period: number; val: number };
}

/**
 * Auditoria 12.02 — Rotatividade de Estoque. Por CCE, junta as três abas
 * (Estoque, 01 ENTRADAS/Compras, 08 SAÍDAS) e calcula:
 *   CMV = Estoque Inicial + Compras − Estoque Final
 * comparando com as Saídas declaradas (CMV ≈ Saídas no modelo
 * EI + Compras = EF + Saídas). Divergência indica indício para auditoria.
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
    const eiCol = resolveCol(cols, opts.estoqueInicialField, [/estoque\s*inicial/i, /invent.*inicial/i, /^estoque/i]);
    const efCol = resolveCol(cols, opts.estoqueFinalField, [/estoque\s*final/i, /invent.*final/i, /^estoque/i]);
    const comprasCol = resolveCol(cols, opts.comprasField, [/compra/i, /entrada/i, /valor.*entrada/i]);
    const saiCol = resolveCol(cols, opts.saidasField, [/sa.da/i, /valor.*sa.da/i]);
    const razaoCol = resolveCol(cols, 'Razao Social', [/raz.o\s*social/i, /nome\s*empres/i]);

    for (const row of report.rows) {
      const company = (row[companyCol] ?? '').trim();
      if (!company) continue;
      const acc = byCompany.get(company) ?? { razao: '', compras: 0, saidas: 0, temSaidas: false };
      if (!acc.razao && razaoCol) acc.razao = (row[razaoCol] ?? '').trim();
      const period = parsePeriod(periodCol ? row[periodCol] : undefined);

      if (comprasCol) acc.compras += parseNum(row[comprasCol]);
      if (saiCol && (row[saiCol] ?? '') !== '') {
        acc.saidas += parseNum(row[saiCol]);
        acc.temSaidas = true;
      }

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
    const cmv = round2(estoqueInicial + acc.compras - estoqueFinal);
    const saidas = round2(acc.saidas);
    const diferenca = round2(cmv - saidas);
    const status: RotatividadeRow['status'] = !acc.temSaidas
      ? 'CALCULADO'
      : Math.abs(diferenca) <= opts.tolerance
        ? 'OK'
        : 'DIVERGENTE';
    out.push({
      cce,
      razaoSocial: acc.razao,
      estoqueInicial,
      compras: round2(acc.compras),
      estoqueFinal,
      cmv,
      saidas,
      diferenca,
      status,
    });
  }

  // Divergentes (maiores diferenças) primeiro.
  const rank = (s: RotatividadeRow['status']) => (s === 'DIVERGENTE' ? 0 : s === 'OK' ? 1 : 2);
  return out.sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      Math.abs(b.diferenca) - Math.abs(a.diferenca) ||
      a.cce.localeCompare(b.cce),
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
