import { CONCURRENCY, ensureDirs, loadConfig } from './config';
import { RunLogger } from './logger';
import { parseAndNormalize } from './transform/parse';
import { writeIndividualMd } from './output/individual';
import {
  buildConsolidatedCSVs,
  buildConsolidatedXlsx,
  writeConsolidatedMd,
} from './output/consolidated';
import { MockSource } from './webi/mock';
import { WebiBrowserSource } from './webi/browser';
import type { NormalizedReport, ReportSource, RunResult } from './types';

/**
 * MODO LOTE — EXECUÇÃO EM SEQUÊNCIA (OBRIGATÓRIO)
 * Regra travada (PROMPT v1.2): concurrency = 1 por estabilidade de sessão BOE/WebI.
 * Processa CCEs[] um por vez; em falha, registra erro + screenshot e CONTINUA.
 * Consolidação (CSVs + MD) somente ao final. Ver docs/contexto-relatorios.md.
 */
async function main(): Promise<void> {
  const cfg = loadConfig();
  ensureDirs(cfg);
  const log = new RunLogger(cfg.logsDir);

  // Invariante: concurrency é obrigatoriamente 1.
  const concurrency: 1 = CONCURRENCY;
  if (concurrency !== 1) throw new Error('concurrency deve ser 1 (regra travada).');

  log.info(`Iniciando lote | modo=${cfg.mode} | concurrency=${concurrency} | CCEs=${cfg.cces.length}`);

  const source: ReportSource =
    cfg.mode === 'mock' ? new MockSource(cfg.rawDir) : new WebiBrowserSource(cfg);

  const results: RunResult[] = [];
  const reports: NormalizedReport[] = [];

  await source.open();
  try {
    for (const cce of cfg.cces) {
      try {
        await source.runReportForCCE(cce); // (1) refresh/render completo
        const raw = await source.exportRaw(cce); // (2) export (.xlsx) presente em disco
        const report = await parseAndNormalize(raw, cfg.exportSheet); // (3) parse + normalização
        const individualReportPath = writeIndividualMd(report, cfg.reportsDir); // (4) relatório individual

        reports.push(report);
        results.push({
          cce,
          status: 'success',
          rowCount: report.rows.length,
          individualReportPath,
        });
        log.logSuccess(cce, report.rows.length);
      } catch (err) {
        const screenshotPath = await source.screenshotError(cce);
        log.logFailure(cce, err);
        results.push({
          cce,
          status: 'failure',
          error: err instanceof Error ? err.message : String(err),
          screenshotPath,
        });
        continue; // não encerra o lote
      }
    }
  } finally {
    await source.close();
  }

  // Consolidação final
  const xlsxPath = await buildConsolidatedXlsx(reports, cfg.consolidatedDir);
  const csvPath = buildConsolidatedCSVs(reports, cfg.consolidatedDir);
  const mdPath = writeConsolidatedMd(results, cfg.consolidatedDir);

  const ok = results.filter((r) => r.status === 'success').length;
  const fail = results.length - ok;
  log.info(`Lote concluído | sucesso=${ok} | falha=${fail}`);
  log.info(`Consolidado XLSX: ${xlsxPath}`);
  log.info(`Consolidado CSV:  ${csvPath}`);
  log.info(`Consolidado MD:   ${mdPath}`);

  // Código de saída != 0 se houve qualquer falha (útil para CI/agendadores).
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Erro fatal no lote:', err);
  process.exit(2);
});
