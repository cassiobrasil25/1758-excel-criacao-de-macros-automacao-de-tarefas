import type { NormalizedReport } from '../types';

export interface RegimeOptions {
  /** Coluna com o regime (ex.: "Tipo Enquadramento"). */
  regimeField: string;
  /** Coluna identificadora da empresa (ex.: "CNPJ"). */
  companyKey: string;
  /** Coluna do ano (ex.: "Ano"). */
  yearField: string;
  /** Regex que reconhece o regime Simples (ex.: /simples/i). */
  simplesPattern: RegExp;
  /** Regex que reconhece o Regime Normal (ex.: /normal/i). */
  normalPattern: RegExp;
}

export interface RegimeTransition {
  cnpj: string;
  razaoSocial: string;
  cce: string;
  ultimoAnoSimples: string;
  primeiroAnoNormal: string;
  /** Linha do tempo "ano:regime" para conferência. */
  linhaDoTempo: string;
}

interface Observation {
  company: string;
  razao: string;
  cce: string;
  year: number;
  regime: 'simples' | 'normal' | 'outro';
  rawRegime: string;
}

/**
 * Detecta empresas que **eram do Simples Nacional** e **passaram para o Regime
 * Normal** (obrigatoriedade de EFD), comparando o regime por ano (CNPJ).
 *
 * Critério: existe um ano com Simples e um ano POSTERIOR com Normal.
 */
export function detectRegimeTransitions(
  reports: NormalizedReport[],
  opts: RegimeOptions,
): RegimeTransition[] {
  const observations: Observation[] = [];

  for (const report of reports) {
    const cols = report.columns;
    const companyCol = resolveCol(cols, opts.companyKey, [
      /cnpj/i,
      /n[uú]mero\s*de\s*inscri/i,
      /inscri/i,
      /cce/i,
    ]);
    const regimeCol = resolveCol(cols, opts.regimeField, [/enquadr/i, /regime/i, /situa.*tribut/i]);
    const yearCol = resolveYearCol(cols, opts.yearField);
    const razaoCol = resolveCol(cols, 'Razao Social', [
      /raz.o\s*social/i,
      /nome\s*empres/i,
      /nome\s*fantasia/i,
    ]);
    if (!companyCol || !regimeCol || !yearCol) continue; // dados sem o necessário

    for (const row of report.rows) {
      const year = parseYear(row[yearCol]);
      if (year === undefined) continue;
      const company = (row[companyCol] ?? '').trim();
      if (!company) continue;
      const raw = (row[regimeCol] ?? '').trim();
      observations.push({
        company,
        razao: razaoCol ? (row[razaoCol] ?? '').trim() : '',
        cce: report.cce.id,
        year,
        regime: classify(raw, opts),
        rawRegime: raw,
      });
    }
  }

  // Agrupa por empresa (CNPJ).
  const byCompany = new Map<string, Observation[]>();
  for (const o of observations) {
    const list = byCompany.get(o.company) ?? [];
    list.push(o);
    byCompany.set(o.company, list);
  }

  const transitions: RegimeTransition[] = [];
  for (const [company, obs] of byCompany) {
    const simplesYears = obs.filter((o) => o.regime === 'simples').map((o) => o.year);
    const normalYears = obs.filter((o) => o.regime === 'normal').map((o) => o.year);
    if (simplesYears.length === 0 || normalYears.length === 0) continue;

    const minSimples = Math.min(...simplesYears);
    const normalAfter = normalYears.filter((y) => y > minSimples);
    if (normalAfter.length === 0) continue; // não houve transição Simples -> Normal

    const primeiroAnoNormal = Math.min(...normalAfter);
    const ultimoAnoSimples = Math.max(...simplesYears.filter((y) => y < primeiroAnoNormal));

    // Dados de exibição: usa a observação mais recente disponível.
    const latest = [...obs].sort((a, b) => b.year - a.year)[0];

    transitions.push({
      cnpj: company,
      razaoSocial: latest.razao,
      cce: latest.cce,
      ultimoAnoSimples: String(ultimoAnoSimples),
      primeiroAnoNormal: String(primeiroAnoNormal),
      linhaDoTempo: timeline(obs),
    });
  }

  // Ordena por ano de migração e CNPJ.
  return transitions.sort(
    (a, b) =>
      a.primeiroAnoNormal.localeCompare(b.primeiroAnoNormal) || a.cnpj.localeCompare(b.cnpj),
  );
}

function classify(value: string, opts: RegimeOptions): Observation['regime'] {
  if (opts.simplesPattern.test(value)) return 'simples';
  if (opts.normalPattern.test(value)) return 'normal';
  return 'outro';
}

function resolveCol(columns: string[], preferred: string, regexes: RegExp[]): string | undefined {
  if (columns.includes(preferred)) return preferred;
  const lowerMatch = columns.find((c) => c.toLowerCase() === preferred.toLowerCase());
  if (lowerMatch) return lowerMatch;
  for (const re of regexes) {
    const c = columns.find((col) => re.test(col));
    if (c) return c;
  }
  return undefined;
}

/**
 * Resolve a coluna do ano preferindo "Ano (Referência)" e evitando
 * "Ano/Mês (Referência)" (que também contém "Ano").
 */
function resolveYearCol(columns: string[], preferred: string): string | undefined {
  if (columns.includes(preferred)) return preferred;
  return (
    columns.find((c) => /^ano\s*\(ref/i.test(c)) ??
    columns.find((c) => /^ano\s*\(/i.test(c)) ??
    columns.find((c) => /\bano\b/i.test(c) && !c.includes('/'))
  );
}

function parseYear(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = value.match(/\d{4}/);
  return m ? Number(m[0]) : undefined;
}

function timeline(obs: Observation[]): string {
  const byYear = new Map<number, string>();
  for (const o of [...obs].sort((a, b) => a.year - b.year)) {
    byYear.set(o.year, o.rawRegime || o.regime);
  }
  return [...byYear.entries()].map(([y, r]) => `${y}:${r}`).join(', ');
}
