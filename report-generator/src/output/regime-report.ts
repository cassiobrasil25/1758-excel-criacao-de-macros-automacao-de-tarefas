import * as fs from 'fs';
import * as path from 'path';
import { writeXlsx } from '../xlsx';
import type { RegimeTransition } from '../transform/regime';

const COLUMNS = [
  'CNPJ',
  'Razao Social',
  'CCE',
  'Ultimo Ano Simples',
  'Primeiro Ano Normal',
  'Data Saida Simples Nacional',
  'Data Obrigatoriedade EFD',
  'Linha do Tempo',
] as const;

/**
 * Gera o relatório "Simples -> Normal" (empresas que saíram do Simples Nacional
 * e passaram ao Regime Normal, obrigadas à EFD), em Excel e Markdown.
 * Retorna os caminhos gerados.
 */
export async function writeRegimeTransitionReport(
  transitions: RegimeTransition[],
  outDir: string,
): Promise<{ xlsx: string; md: string }> {
  const rows = transitions.map((t) => ({
    CNPJ: t.cnpj,
    'Razao Social': t.razaoSocial,
    CCE: t.cce,
    'Ultimo Ano Simples': t.ultimoAnoSimples,
    'Primeiro Ano Normal': t.primeiroAnoNormal,
    'Data Saida Simples Nacional': t.dataSaidaSimples,
    'Data Obrigatoriedade EFD': t.dataObrigatoriedadeEFD,
    'Linha do Tempo': t.linhaDoTempo,
  }));

  const xlsx = path.join(outDir, 'transicao-simples-normal.xlsx');
  await writeXlsx(xlsx, [{ name: 'Simples_para_Normal', columns: [...COLUMNS], rows }]);

  const md = path.join(outDir, 'transicao-simples-normal.md');
  fs.writeFileSync(md, renderMd(transitions));

  return { xlsx, md };
}

function renderMd(transitions: RegimeTransition[]): string {
  const lines: string[] = [];
  lines.push('# Empresas que saíram do Simples Nacional para o Regime Normal');
  lines.push('');
  lines.push('Empresas que eram optantes do Simples Nacional e passaram ao Regime');
  lines.push('Normal — portanto obrigadas à entrega da EFD.');
  lines.push('');
  lines.push(`- Gerado em: ${new Date().toISOString()}`);
  lines.push(`- Total de empresas em transição: ${transitions.length}`);
  lines.push('');

  if (transitions.length === 0) {
    lines.push('_Nenhuma empresa em transição Simples → Normal encontrada nos dados._');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(
    '| CNPJ | Razão Social | CCE | Último Ano Simples | Primeiro Ano Normal | Data Saída Simples | Data Obrigatoriedade EFD | Linha do Tempo |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const t of transitions) {
    lines.push(
      `| ${t.cnpj} | ${esc(t.razaoSocial)} | ${t.cce} | ${t.ultimoAnoSimples} | ${t.primeiroAnoNormal} | ${t.dataSaidaSimples} | ${t.dataObrigatoriedadeEFD} | ${esc(t.linhaDoTempo)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function esc(v: string): string {
  return v.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
