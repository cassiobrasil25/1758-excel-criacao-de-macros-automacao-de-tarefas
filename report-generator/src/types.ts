/**
 * Modelos de domínio para a geração de relatórios por CCE.
 * Veja docs/contexto-relatorios.md para as regras travadas (PROMPT v1.2).
 */

/** Um CCE (item da lista processada em lote). */
export interface CCE {
  /** Identificador único do CCE (ex.: código). */
  id: string;
  /** Rótulo amigável, opcional. */
  label?: string;
  /** Id do documento WebI a abrir/atualizar, se específico por CCE. */
  docId?: string;
}

/** Resultado do export bruto do WebI: arquivo presente em disco. */
export interface RawExport {
  cce: CCE;
  /** Caminho absoluto do arquivo bruto exportado (ex.: CSV). */
  filePath: string;
}

/** Uma linha normalizada (colunas → valores). */
export type NormalizedRow = Record<string, string>;

/** Dados normalizados de um CCE. */
export interface NormalizedReport {
  cce: CCE;
  columns: string[];
  rows: NormalizedRow[];
  generatedAt: string;
}

/** Resultado do processamento de um CCE no lote. */
export interface RunResult {
  cce: CCE;
  status: 'success' | 'failure';
  error?: string;
  screenshotPath?: string;
  individualReportPath?: string;
  rowCount?: number;
}

/**
 * Fonte de relatórios: abstrai COMO o WebI é atualizado/exportado.
 * Implementações: WebiBrowserSource (Playwright) e MockSource (sem BOE).
 */
export interface ReportSource {
  open(): Promise<void>;
  /** (1) refresh/render completo do relatório do CCE. */
  runReportForCCE(cce: CCE): Promise<void>;
  /** (2) export concluído e arquivo presente em disco. */
  exportRaw(cce: CCE): Promise<RawExport>;
  /** Em caso de falha: captura screenshot de evidência. */
  screenshotError(cce: CCE): Promise<string | undefined>;
  close(): Promise<void>;
}
