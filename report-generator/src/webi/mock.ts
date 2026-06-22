import * as path from 'path';
import { writeXlsx } from '../xlsx';
import type { CCE, RawExport, ReportSource } from '../types';

/**
 * MockSource — implementa ReportSource sem BOE/WebI.
 * Gera um .xlsx bruto sintético por CCE, permitindo testar a orquestração
 * (lote sequencial, parse, relatórios individuais e consolidação) ponta a ponta.
 *
 * Útil para CI e para validar a lógica antes de plugar o WebI real.
 */
export class MockSource implements ReportSource {
  constructor(private readonly rawDir: string) {}

  async open(): Promise<void> {
    /* nada a abrir no mock */
  }

  async runReportForCCE(_cce: CCE): Promise<void> {
    /* simula refresh/render — instantâneo no mock */
  }

  async exportRaw(cce: CCE): Promise<RawExport> {
    // Falha proposital para CCE de id "FAIL*", para exercitar o caminho de erro.
    if (cce.id.toUpperCase().startsWith('FAIL')) {
      throw new Error(`(mock) falha simulada de export para o CCE ${cce.id}`);
    }

    const columns = [
      'CCE',
      'CNPJ',
      'Razao Social',
      'Ano',
      'Ano/Mês (Referência)',
      'Tipo Enquadramento',
      'OBRIGADO',
      'Estoque Inicial',
      'Entradas',
      'Estoque Final',
      'Saídas',
      'Saldo Credor',
    ];
    const h = hash(cce.id);
    const cnpj = formatCnpj(h);
    const years = [2022, 2023, 2024, 2025];
    // 1 em cada 3 empresas NÃO migra (fica sempre no Simples); as demais migram
    // do Simples para o Normal a partir de um ano de transição determinístico.
    const migra = h % 3 !== 0;
    const anoTransicao = [2023, 2024, 2025][h % 3];

    // Rotatividade de estoque: EI + Entradas = EF + Saídas.
    // Metade das empresas (h % 2) tem divergência proposital (EF reduzido).
    const estoqueInicial = 1000;
    const entradasAno = 100; // soma 4 anos = 400
    const saidasAno = 100; // soma 4 anos = 400
    // Para fechar: EF = EI + Entradas - Saídas = 1000 + 400 - 400 = 1000.
    const estoqueFinal = h % 2 === 0 ? 900 : 1000; // 900 => DIVERGENTE (dif 100)

    const rows = years.map((ano, idx) => {
      const normal = migra && ano >= anoTransicao;
      return {
        CCE: cce.id,
        CNPJ: cnpj,
        'Razao Social': `Empresa ${cce.id} LTDA`,
        Ano: String(ano),
        'Ano/Mês (Referência)': `${ano}01`,
        'Tipo Enquadramento': normal ? 'Normal' : 'Simples Nacional',
        OBRIGADO: normal ? 'S' : 'N',
        'Estoque Inicial': idx === 0 ? estoqueInicial.toFixed(2) : '',
        Entradas: entradasAno.toFixed(2),
        'Estoque Final': idx === years.length - 1 ? estoqueFinal.toFixed(2) : '',
        'Saídas': saidasAno.toFixed(2),
        'Saldo Credor': (500 + ((h + ano) % 1500)).toFixed(2),
      };
    });

    const filePath = path.join(this.rawDir, `${cce.id}.xlsx`);
    await writeXlsx(filePath, [{ name: 'EFD_MOV', columns, rows }]);
    return { cce, filePath };
  }

  async screenshotError(_cce: CCE): Promise<string | undefined> {
    return undefined; // sem navegador no mock
  }

  async close(): Promise<void> {
    /* nada a fechar */
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** CNPJ sintético determinístico (apenas para o mock). */
function formatCnpj(h: number): string {
  const d = String(h).padStart(14, '0').slice(0, 14);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}
