import * as fs from 'fs';
import * as path from 'path';
import { writeXlsx } from '../xlsx';
import type { EfdObligation } from '../transform/efd-obrigatoriedade';

const COLUMNS = [
  'CCE',
  'CNPJ',
  'Razao Social',
  'Obrigado EFD',
  'Primeiro Periodo Obrigado',
  'Data Inicio Obrigatoriedade EFD',
] as const;

/**
 * Gera o relatório "OBRIGATORIEDADE EFD": demonstra os contribuintes que
 * estavam obrigados a entregar a EFD (S) ou não (N), e desde quando.
 */
export async function writeEfdObligationReport(
  obligations: EfdObligation[],
  outDir: string,
): Promise<{ xlsx: string; md: string; obrigados: number; total: number }> {
  const sorted = [...obligations].sort(
    (a, b) =>
      Number(b.obrigado) - Number(a.obrigado) ||
      a.primeiroPeriodoObrigado.localeCompare(b.primeiroPeriodoObrigado) ||
      a.cnpj.localeCompare(b.cnpj),
  );

  const rows = sorted.map((o) => ({
    CCE: o.cce,
    CNPJ: o.cnpj,
    'Razao Social': o.razaoSocial,
    'Obrigado EFD': o.obrigado ? 'S' : 'N',
    'Primeiro Periodo Obrigado': o.primeiroPeriodoObrigado,
    'Data Inicio Obrigatoriedade EFD': o.dataInicioObrigatoriedade,
  }));

  const xlsx = path.join(outDir, 'obrigatoriedade-efd.xlsx');
  await writeXlsx(xlsx, [{ name: 'Obrigatoriedade_EFD', columns: [...COLUMNS], rows }]);

  const obrigados = sorted.filter((o) => o.obrigado).length;
  const md = path.join(outDir, 'obrigatoriedade-efd.md');
  fs.writeFileSync(md, renderMd(sorted, obrigados));

  return { xlsx, md, obrigados, total: sorted.length };
}

function renderMd(obligations: EfdObligation[], obrigados: number): string {
  const lines: string[] = [];
  lines.push('# Obrigatoriedade da EFD');
  lines.push('');
  lines.push('Contribuintes que estavam obrigados a entregar a EFD (S) ou não (N).');
  lines.push('');
  lines.push(`- Gerado em: ${new Date().toISOString()}`);
  lines.push(`- Total de contribuintes: ${obligations.length}`);
  lines.push(`- Obrigados: ${obrigados} | Não obrigados: ${obligations.length - obrigados}`);
  lines.push('');
  if (obligations.length === 0) {
    lines.push('_Sem dados de obrigatoriedade nos relatórios processados._');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('| CCE | CNPJ | Razão Social | Obrigado | Primeiro Período | Data Início |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const o of obligations) {
    lines.push(
      `| ${o.cce} | ${o.cnpj} | ${esc(o.razaoSocial)} | ${o.obrigado ? 'S' : 'N'} | ${o.primeiroPeriodoObrigado} | ${o.dataInicioObrigatoriedade} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function esc(v: string): string {
  return v.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
