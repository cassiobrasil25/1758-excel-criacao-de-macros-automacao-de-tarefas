import * as fs from 'fs';
import * as path from 'path';
import { writeXlsx } from '../xlsx';
import type { RotatividadeRow } from '../transform/rotatividade';

const COLUMNS = [
  'CNPJ',
  'Razao Social',
  'CCE',
  'Periodos',
  'Membros Distintos',
  'Entradas',
  'Saidas',
  'Rotatividade',
  'Linha do Tempo',
] as const;

/**
 * Gera o relatório de auditoria de rotatividade (12.02): empresas com troca de
 * quadro (entradas/saídas de membros) ao longo dos períodos.
 */
export async function writeRotatividadeReport(
  rows: RotatividadeRow[],
  outDir: string,
): Promise<{ xlsx: string; md: string; total: number }> {
  const sheetRows = rows.map((r) => ({
    CNPJ: r.cnpj,
    'Razao Social': r.razaoSocial,
    CCE: r.cce,
    Periodos: String(r.periodos),
    'Membros Distintos': String(r.membrosDistintos),
    Entradas: String(r.entradas),
    Saidas: String(r.saidas),
    Rotatividade: String(r.rotatividade),
    'Linha do Tempo': r.linhaDoTempo,
  }));

  const xlsx = path.join(outDir, 'rotatividade.xlsx');
  await writeXlsx(xlsx, [{ name: 'Rotatividade_12_02', columns: [...COLUMNS], rows: sheetRows }]);

  const md = path.join(outDir, 'rotatividade.md');
  fs.writeFileSync(md, renderMd(rows));

  return { xlsx, md, total: rows.length };
}

function renderMd(rows: RotatividadeRow[]): string {
  const lines: string[] = [];
  lines.push('# Auditoria 12.02 — Rotatividade do quadro');
  lines.push('');
  lines.push('Empresas com troca de quadro (entradas/saídas de membros) entre períodos.');
  lines.push('');
  lines.push(`- Gerado em: ${new Date().toISOString()}`);
  lines.push(`- Empresas com rotatividade: ${rows.length}`);
  lines.push('');
  if (rows.length === 0) {
    lines.push('_Nenhuma empresa com rotatividade acima do mínimo configurado._');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('| CNPJ | Razão Social | CCE | Períodos | Distintos | Entradas | Saídas | Rotatividade | Linha do Tempo |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    lines.push(
      `| ${r.cnpj} | ${esc(r.razaoSocial)} | ${r.cce} | ${r.periodos} | ${r.membrosDistintos} | ${r.entradas} | ${r.saidas} | ${r.rotatividade} | ${esc(r.linhaDoTempo)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function esc(v: string): string {
  return v.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
