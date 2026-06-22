import * as fs from 'fs';
import * as path from 'path';
import type { NormalizedReport } from '../types';

/**
 * (4) writeIndividualMd — gera o relatório individual (Markdown) do CCE.
 * Retorna o caminho do arquivo gerado.
 */
export function writeIndividualMd(report: NormalizedReport, reportsDir: string): string {
  const file = path.join(reportsDir, `relatorio-${sanitize(report.cce.id)}.md`);
  const title = report.cce.label ? `${report.cce.id} — ${report.cce.label}` : report.cce.id;

  const lines: string[] = [];
  lines.push(`# Relatório — CCE ${title}`);
  lines.push('');
  lines.push(`- Gerado em: ${report.generatedAt}`);
  lines.push(`- Total de linhas: ${report.rows.length}`);
  lines.push('');

  if (report.columns.length > 0) {
    lines.push(mdTableHeader(report.columns));
    for (const row of report.rows) {
      lines.push(mdTableRow(report.columns.map((c) => row[c] ?? '')));
    }
  } else {
    lines.push('_Sem dados retornados para este CCE._');
  }
  lines.push('');

  fs.writeFileSync(file, lines.join('\n'));
  return file;
}

function mdTableHeader(columns: string[]): string {
  return `| ${columns.map(escapeCell).join(' | ')} |\n| ${columns.map(() => '---').join(' | ')} |`;
}

function mdTableRow(values: string[]): string {
  return `| ${values.map(escapeCell).join(' | ')} |`;
}

function escapeCell(v: string): string {
  return v.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}
