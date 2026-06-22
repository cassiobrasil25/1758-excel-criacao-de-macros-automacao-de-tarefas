import type { NormalizedReport } from '../types';
import { normalizeKey } from './regime';

export interface RotatividadeOptions {
  /** Coluna do "membro" que entra/sai (ex.: sócio). */
  memberField: string;
  /** Coluna identificadora da empresa (ex.: "CNPJ"). */
  companyKey: string;
  /** Coluna do período (ex.: "Ano/Mês (Referência)" ou "Ano"). */
  periodField: string;
  /** Mínimo de mudanças (entradas+saídas) para entrar no relatório. */
  minMudancas: number;
}

export interface RotatividadeRow {
  cnpj: string;
  razaoSocial: string;
  cce: string;
  periodos: number;
  membrosDistintos: number;
  entradas: number;
  saidas: number;
  /** Total de mudanças no quadro (entradas + saídas). */
  rotatividade: number;
  /** Linha do tempo "periodo:[membros]" para conferência. */
  linhaDoTempo: string;
}

interface Obs {
  company: string;
  razao: string;
  cce: string;
  period: number;
  member: string;
}

/**
 * Audita a "rotatividade" do quadro (por padrão, sócios) por empresa (CNPJ):
 * conta entradas e saídas de membros entre períodos consecutivos.
 */
export function detectRotatividade(
  reports: NormalizedReport[],
  opts: RotatividadeOptions,
): RotatividadeRow[] {
  const observations: Obs[] = [];

  for (const report of reports) {
    const cols = report.columns;
    const companyCol = resolveCol(cols, opts.companyKey, [/cnpj/i, /n[uú]mero\s*de\s*inscri/i, /cce/i]);
    const memberCol = resolveCol(cols, opts.memberField, [/s[oó]cio/i, /cpf/i, /respons/i, /nome.*s[oó]c/i]);
    const periodCol = resolveCol(cols, opts.periodField, [/ano\s*\/?\s*m[eê]s/i, /per[ií]odo/i, /^ano\b/i]);
    const razaoCol = resolveCol(cols, 'Razao Social', [/raz.o\s*social/i, /nome\s*empres/i]);
    if (!companyCol || !memberCol || !periodCol) continue;

    for (const row of report.rows) {
      const period = parsePeriod(row[periodCol]);
      const member = (row[memberCol] ?? '').trim();
      const company = (row[companyCol] ?? '').trim();
      if (period === undefined || !company || !member) continue;
      observations.push({
        company,
        razao: razaoCol ? (row[razaoCol] ?? '').trim() : '',
        cce: report.cce.id,
        period,
        member,
      });
    }
  }

  const byCompany = new Map<string, Obs[]>();
  for (const o of observations) {
    const list = byCompany.get(o.company) ?? [];
    list.push(o);
    byCompany.set(o.company, list);
  }

  const out: RotatividadeRow[] = [];
  for (const [company, obs] of byCompany) {
    // membros por período
    const byPeriod = new Map<number, Set<string>>();
    for (const o of obs) {
      const set = byPeriod.get(o.period) ?? new Set<string>();
      set.add(o.member);
      byPeriod.set(o.period, set);
    }
    const periods = [...byPeriod.keys()].sort((a, b) => a - b);

    let entradas = 0;
    let saidas = 0;
    for (let i = 1; i < periods.length; i++) {
      const prev = byPeriod.get(periods[i - 1])!;
      const cur = byPeriod.get(periods[i])!;
      for (const m of cur) if (!prev.has(m)) entradas++;
      for (const m of prev) if (!cur.has(m)) saidas++;
    }

    const distintos = new Set(obs.map((o) => o.member)).size;
    const rotatividade = entradas + saidas;
    if (rotatividade < opts.minMudancas) continue;

    const latest = [...obs].sort((a, b) => b.period - a.period)[0];
    const linhaDoTempo = periods
      .map((p) => `${p}:[${[...byPeriod.get(p)!].join(',')}]`)
      .join(' ');

    out.push({
      cnpj: company,
      razaoSocial: latest.razao,
      cce: latest.cce,
      periodos: periods.length,
      membrosDistintos: distintos,
      entradas,
      saidas,
      rotatividade,
      linhaDoTempo,
    });
  }

  return out.sort((a, b) => b.rotatividade - a.rotatividade || a.cnpj.localeCompare(b.cnpj));
}

/** Indexa por identificador normalizado (dígitos), p/ cruzar com outras análises. */
export function rotatividadeByCompany(rows: RotatividadeRow[]): Map<string, RotatividadeRow> {
  const map = new Map<string, RotatividadeRow>();
  for (const r of rows) {
    const k = normalizeKey(r.cnpj);
    if (k) map.set(k, r);
  }
  return map;
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

/** "201201"->201201; "2012"->2012 (YYYYMM ou YYYY). */
function parsePeriod(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const d = value.replace(/\D/g, '');
  if (d.length >= 6) return Number(d.slice(0, 6));
  if (d.length >= 4) return Number(d.slice(0, 4));
  return undefined;
}
