import * as fs from 'fs';
import * as path from 'path';
import { writeXlsx } from '../xlsx';
import type { RotatividadeRow } from '../transform/rotatividade';

const COLUMNS = [
  'CCE',
  'NCM',
  'Razao Social',
  'Estoque Inicial',
  'Compras',
  'Estoque Final',
  'CMV (EI+Compras-EF)',
  'Saidas',
  'Diferenca (CMV-Saidas)',
  'Status',
] as const;

/**
 * Auditoria 12.02 — Rotatividade de Estoque consolidada por CCE (junta as três
 * abas: Estoque, ENTRADAS/Compras e SAÍDAS). Calcula o CMV e o confronta com as
 * Saídas declaradas.
 */
export async function writeRotatividadeReport(
  rows: RotatividadeRow[],
  outDir: string,
): Promise<{ xlsx: string; md: string; total: number; divergentes: number }> {
  const sheetRows = rows.map((r) => ({
    CCE: r.cce,
    NCM: r.ncm,
    'Razao Social': r.razaoSocial,
    'Estoque Inicial': num(r.estoqueInicial),
    Compras: num(r.compras),
    'Estoque Final': num(r.estoqueFinal),
    'CMV (EI+Compras-EF)': num(r.cmv),
    Saidas: num(r.saidas),
    'Diferenca (CMV-Saidas)': num(r.diferenca),
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
  lines.push('# Auditoria 12.02 — Rotatividade de Estoque');
  lines.push('');
  lines.push('Por **CCE + NCM** (nível Analítico — junta Estoque + ENTRADAS/Compras + SAÍDAS):');
  lines.push('**CMV = Estoque Inicial + Compras − Estoque Final**, confrontado com as Saídas.');
  lines.push('No modelo EI + Compras = EF + Saídas, a diferença (CMV − Saídas) deveria ser 0.');
  lines.push('');
  lines.push(`- Gerado em: ${new Date().toISOString()}`);
  lines.push(`- Linhas (CCE+NCM) analisadas: ${rows.length}`);
  lines.push(`- Divergentes: ${divergentes} | OK: ${rows.filter((r) => r.status === 'OK').length} | Sem saídas p/ comparar: ${rows.filter((r) => r.status === 'CALCULADO').length}`);
  lines.push('');
  if (rows.length === 0) {
    lines.push('_Sem dados de estoque/compras/saídas nos relatórios processados._');
    lines.push('');
    return lines.join('\n');
  }
  lines.push('| CCE | NCM | Razão Social | Est. Inicial | Compras | Est. Final | CMV | Saídas | Diferença | Status |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const r of rows) {
    lines.push(
      `| ${r.cce} | ${r.ncm} | ${esc(r.razaoSocial)} | ${num(r.estoqueInicial)} | ${num(r.compras)} | ${num(r.estoqueFinal)} | ${num(r.cmv)} | ${num(r.saidas)} | ${num(r.diferenca)} | ${r.status} |`,
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
