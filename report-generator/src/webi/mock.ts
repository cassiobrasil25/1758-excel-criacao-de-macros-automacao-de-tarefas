import * as fs from 'fs';
import * as path from 'path';
import { toCsv } from '../csv';
import type { CCE, RawExport, ReportSource } from '../types';

/**
 * MockSource — implementa ReportSource sem BOE/WebI.
 * Gera um CSV bruto sintético por CCE, permitindo testar a orquestração
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

    const columns = ['data', 'rota', 'motorista', 'km', 'custo'];
    const rowCount = 3 + (hash(cce.id) % 3); // 3..5 linhas determinísticas
    const rows = Array.from({ length: rowCount }, (_, i) => ({
      data: `2026-06-${String(10 + i).padStart(2, '0')}`,
      rota: `${cce.id}-R${i + 1}`,
      motorista: `Motorista ${((hash(cce.id) + i) % 9) + 1}`,
      km: String(100 + ((hash(cce.id) + i * 7) % 400)),
      custo: (500 + ((hash(cce.id) + i * 13) % 1500)).toFixed(2),
    }));

    const filePath = path.join(this.rawDir, `${cce.id}.csv`);
    fs.writeFileSync(filePath, toCsv(columns, rows));
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
