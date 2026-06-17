import * as fs from 'fs';
import * as path from 'path';
import { toCsv } from '../csv';
import type { NormalizedReport, RunResult } from '../types';

/**
 * (final) buildConsolidatedCSVs — combina todas as linhas de todos os CCEs
 * num único CSV, com a coluna `cce` na frente. Retorna o caminho gerado.
 */
export function buildConsolidatedCSVs(reports: NormalizedReport[], consolidatedDir: string): string {
  const allColumns = new Set<string>();
  for (const r of reports) r.columns.forEach((c) => allColumns.add(c));
  const columns = ['cce', ...allColumns];

  const rows: Record<string, string>[] = [];
  for (const r of reports) {
    for (const row of r.rows) {
      rows.push({ cce: r.cce.id, ...row });
    }
  }

  const file = path.join(consolidatedDir, 'consolidado.csv');
  fs.writeFileSync(file, toCsv(columns, rows));
  return file;
}

/**
 * (final) writeConsolidatedMd — resumo do lote: status por CCE e totais.
 * Retorna o caminho gerado.
 */
export function writeConsolidatedMd(results: RunResult[], consolidatedDir: string): string {
  const file = path.join(consolidatedDir, 'consolidado.md');
  const success = results.filter((r) => r.status === 'success');
  const failure = results.filter((r) => r.status === 'failure');
  const totalRows = success.reduce((acc, r) => acc + (r.rowCount ?? 0), 0);

  const lines: string[] = [];
  lines.push('# Relatório consolidado do lote');
  lines.push('');
  lines.push(`- Gerado em: ${new Date().toISOString()}`);
  lines.push(`- CCEs processados: ${results.length}`);
  lines.push(`- Sucesso: ${success.length} | Falha: ${failure.length}`);
  lines.push(`- Total de linhas (sucesso): ${totalRows}`);
  lines.push('');
  lines.push('| CCE | Status | Linhas | Evidência |');
  lines.push('| --- | --- | --- | --- |');
  for (const r of results) {
    const evidence =
      r.status === 'success'
        ? r.individualReportPath
          ? path.basename(r.individualReportPath)
          : ''
        : r.screenshotPath
          ? path.basename(r.screenshotPath)
          : '(sem screenshot)';
    lines.push(`| ${r.cce.id} | ${r.status} | ${r.rowCount ?? ''} | ${evidence} |`);
  }
  lines.push('');

  if (failure.length > 0) {
    lines.push('## Falhas');
    lines.push('');
    for (const r of failure) {
      lines.push(`- **${r.cce.id}**: ${r.error ?? 'erro desconhecido'}`);
    }
    lines.push('');
  }

  fs.writeFileSync(file, lines.join('\n'));
  return file;
}
