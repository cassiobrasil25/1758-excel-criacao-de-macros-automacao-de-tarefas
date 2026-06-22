import * as fs from 'fs';
import * as path from 'path';
import { writeXlsx } from '../xlsx';
import type { RotatividadeRow } from '../transform/rotatividade';

const COLUMNS = [
  'CCE',
  'Razao Social',
  'Estoque Inicial',
  'Entradas',
  'Estoque Final',
  'Saidas',
  'Esperado (EI+Entradas)',
  'Realizado (EF+Saidas)',
  'Diferenca',
  'Status',
] as const;

/**
 * Gera a auditoria 12.02 — rotatividade de estoque: por CCE, confronta
 * Estoque Inicial + Entradas com Estoque Final + Saídas e aponta divergências.
 */
export async function writeRotatividadeReport(
  rows: RotatividadeRow[],
  outDir: string,
): Promise<{ xlsx: string; md: string; total: number; divergentes: number }> {
  const sheetRows = rows.map((r) => ({
    CCE: r.cce,
    'Razao Social': r.razaoSocial,
    'Estoque Inicial': num(r.estoqueInicial),
    Entradas: num(r.entradas),
    'Estoque Final': num(r.estoqueFinal),
    Saidas: num(r.saidas),
    'Esperado (EI+Entradas)': num(r.esperado),
    'Realizado (EF+Saidas)': num(r.realizado),
    Diferenca: num(r.diferenca),
    Status: r.status,
  }));

  const xlsx = path.join(outDir, 'rotatividade.xlsx');
  await writeXlsx(xlsx, [{ name: 'Rotatividade_12_02', columns: [...COLUMNS], rows: sheetRows }]);

  const divergentes = rows.filter((r) => r.status === 'DIVERGENTE').length;
  const md = path.join(outDir, 'rotatividade.md');
  fs.writeFileSync(md, renderMd(rows, divergentes));

  return { xlsx, md, total: rows.length, divergentes };
}

function renderMd(rows: RotatividadeRow[], divergentes: number): string {
  const lines: string[] = [];
  lines.push('# Auditoria 12.02 — Rotatividade de estoque');
  lines.push('');
  lines.push('Confronto por CCE: **Estoque Inicial + Entradas = Estoque Final + Saídas**.');
  lines.push('Divergências (diferença ≠ 0) indicam inconsistência para auditoria.');
  lines.push('');
  lines.push(`- Gerado em: ${new Date().toISOString()}`);
  lines.push(`- CCEs analisados: ${rows.length}`);
  lines.push(`- Divergentes: ${divergentes} | OK: ${rows.length - divergentes}`);
  lines.push('');
  if (rows.length === 0) {
    lines.push('_Sem dados de estoque/entradas/saídas nos relatórios processados._');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('| CCE | Razão Social | Est. Inicial | Entradas | Est. Final | Saídas | Esperado | Realizado | Diferença | Status |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const r of rows) {
    lines.push(
      `| ${r.cce} | ${esc(r.razaoSocial)} | ${num(r.estoqueInicial)} | ${num(r.entradas)} | ${num(r.estoqueFinal)} | ${num(r.saidas)} | ${num(r.esperado)} | ${num(r.realizado)} | ${num(r.diferenca)} | ${r.status} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function num(n: number): string {
  return n.toFixed(2);
}

function esc(v: string): string {
  return v.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
