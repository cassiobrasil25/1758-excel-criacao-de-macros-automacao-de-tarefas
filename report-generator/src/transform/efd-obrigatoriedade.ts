import type { NormalizedReport } from '../types';
import { normalizeKey } from './regime';

export interface EfdOptions {
  /** Coluna com o indicador de obrigatoriedade (ex.: "OBRIGADO"). */
  obrigadoField: string;
  /** Coluna do período Ano/Mês (ex.: "Ano/Mês (Referência)"). */
  periodField: string;
  /** Coluna identificadora da empresa (ex.: "CNPJ"). */
  companyKey: string;
  /** Regex que reconhece "obrigado = sim" (ex.: /^s/i para S/Sim). */
  yesPattern: RegExp;
}

export interface EfdObligation {
  cnpj: string;
  cce: string;
  razaoSocial: string;
  /** true se em algum período esteve obrigado à EFD. */
  obrigado: boolean;
  /** Primeiro período (Ano/Mês, YYYYMM) com OBRIGADO = S. */
  primeiroPeriodoObrigado: string;
  /** Data de início da obrigatoriedade (01/MM/AAAA do primeiro período obrigado). */
  dataInicioObrigatoriedade: string;
}

interface Obs {
  company: string;
  cce: string;
  razao: string;
  period: number; // YYYYMM
  obrigado: boolean;
}

/**
 * Detecta, por empresa (CNPJ), se esteve obrigada à EFD e desde quando, a
 * partir do campo OBRIGADO por Ano/Mês (relatório "OBRIGATORIEDADE EFD").
 * Retorna um mapa indexado por identificador normalizado (dígitos).
 */
export function detectEfdObligation(
  reports: NormalizedReport[],
  opts: EfdOptions,
): Map<string, EfdObligation> {
  const observations: Obs[] = [];

  for (const report of reports) {
    const cols = report.columns;
    const companyCol = resolveCol(cols, opts.companyKey, [
      /cnpj/i,
      /n[uú]mero\s*de\s*inscri/i,
      /cce/i,
    ]);
    const obrigadoCol = resolveCol(cols, opts.obrigadoField, [/obrigad/i]);
    const periodCol = resolveCol(cols, opts.periodField, [/ano\s*\/?\s*m[eê]s/i, /per[ií]odo/i]);
    const razaoCol = resolveCol(cols, 'Razao Social', [/raz.o\s*social/i, /nome\s*empres/i]);
    if (!companyCol || !obrigadoCol || !periodCol) continue;

    for (const row of report.rows) {
      const period = parsePeriod(row[periodCol]);
      if (period === undefined) continue;
      const company = (row[companyCol] ?? '').trim();
      if (!company) continue;
      observations.push({
        company,
        cce: report.cce.id,
        razao: razaoCol ? (row[razaoCol] ?? '').trim() : '',
        period,
        obrigado: opts.yesPattern.test((row[obrigadoCol] ?? '').trim()),
      });
    }
  }

  const byCompany = new Map<string, Obs[]>();
  for (const o of observations) {
    const list = byCompany.get(o.company) ?? [];
    list.push(o);
    byCompany.set(o.company, list);
  }

  const result = new Map<string, EfdObligation>();
  for (const [company, obs] of byCompany) {
    const obrigadoPeriods = obs.filter((o) => o.obrigado).map((o) => o.period);
    const latest = [...obs].sort((a, b) => b.period - a.period)[0];
    const obrigado = obrigadoPeriods.length > 0;
    const primeiro = obrigado ? Math.min(...obrigadoPeriods) : undefined;

    result.set(normalizeKey(company), {
      cnpj: company,
      cce: latest.cce,
      razaoSocial: latest.razao,
      obrigado,
      primeiroPeriodoObrigado: primeiro ? String(primeiro) : '',
      dataInicioObrigatoriedade: primeiro ? periodToDate(primeiro) : '',
    });
  }

  return result;
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

/** "201201" ou "2012/01" -> 201201 (YYYYMM). */
function parsePeriod(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6) return undefined;
  return Number(digits.slice(0, 6));
}

/** 201201 -> "01/01/2012". */
function periodToDate(yyyymm: number): string {
  const s = String(yyyymm);
  return `01/${s.slice(4, 6)}/${s.slice(0, 4)}`;
}
