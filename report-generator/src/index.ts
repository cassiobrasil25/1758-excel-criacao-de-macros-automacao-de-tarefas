import * as fs from 'fs';
import * as path from 'path';
import { CONCURRENCY, ensureDirs, loadConfig } from './config';
import { RunLogger } from './logger';
import { Checkpoint } from './checkpoint';
import { parseAllSheets } from './transform/parse';
import type { CCE, NormalizedReport, ReportSource, RunResult } from './types';
import { writeIndividualMd } from './output/individual';
import {
  buildConsolidatedCSVs,
  buildConsolidatedXlsx,
  writeConsolidatedMd,
} from './output/consolidated';
import { detectRegimeTransitions, transitionsByCompany } from './transform/regime';
import { detectEfdObligation } from './transform/efd-obrigatoriedade';
import { writeRegimeTransitionReport } from './output/regime-report';
import { writeEfdObligationReport } from './output/efd-report';
import { buildLevantamentoReport, type DateInfo } from './output/levantamento-efd';
import { MockSource } from './webi/mock';
import { WebiBrowserSource } from './webi/browser';

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
  const reports: NormalizedReport[] = []; // aba primária (relatório individual + consolidação)
  const analysisReports: NormalizedReport[] = []; // todas as abas (análises regime/EFD)

  // Checkpoint / retomada: pula CCEs já concluídos com sucesso (reaproveitando o
  // .xlsx bruto em disco) e reprocessa os que falharam.
  const checkpoint = new Checkpoint(cfg.checkpointPath);
  const prior = cfg.resume ? checkpoint.load() : new Map();
  const total = cfg.cces.length;
  let opened = false;
  let retomados = 0;
  let processados = 0;
  const ensureOpen = async (): Promise<void> => {
    if (!opened) {
      await source.open();
      opened = true;
    }
  };

  const pickPrimary = (sheets: NormalizedReport[], cce: CCE): NormalizedReport =>
    sheets.find((s) => s.sheet === cfg.exportSheet) ?? sheets[0] ?? emptyReport(cce);

  try {
    let i = 0;
    for (const cce of cfg.cces) {
      i++;
      const rawPath = path.join(cfg.rawDir, `${cce.id}.xlsx`);
      const priorEntry = prior.get(cce.id);

      // Retomada: já concluído com sucesso e .xlsx bruto presente -> reusa.
      if (cfg.resume && priorEntry?.status === 'success' && fs.existsSync(rawPath)) {
        try {
          const sheets = await parseAllSheets({ cce, filePath: rawPath });
          analysisReports.push(...sheets);
          const report = pickPrimary(sheets, cce);
          reports.push(report);
          results.push({
            cce,
            status: 'success',
            rowCount: report.rows.length,
            individualReportPath: priorEntry.individualReportPath,
          });
          retomados++;
          log.info(`[${i}/${total}] CCE ${cce.id}: retomado do checkpoint (${report.rows.length} linhas)`);
          continue;
        } catch {
          /* falhou ao reusar o bruto -> cai no fluxo normal de busca */
        }
      }

      try {
        log.info(`[${i}/${total}] CCE ${cce.id}: processando...`);
        await ensureOpen();
        await source.runReportForCCE(cce); // (1) refresh/render completo
        const raw = await source.exportRaw(cce); // (2) export (.xlsx) presente em disco
        const sheets = await parseAllSheets(raw); // (3) parse de TODAS as abas
        analysisReports.push(...sheets);
        const report = pickPrimary(sheets, cce);
        const individualReportPath = writeIndividualMd(report, cfg.reportsDir); // (4) relatório individual

        reports.push(report);
        results.push({ cce, status: 'success', rowCount: report.rows.length, individualReportPath });
        checkpoint.append({
          cce: cce.id,
          status: 'success',
          rowCount: report.rows.length,
          individualReportPath,
          rawPath: raw.filePath,
          at: new Date().toISOString(),
        });
        processados++;
        log.logSuccess(cce, report.rows.length);
      } catch (err) {
        const screenshotPath = await source.screenshotError(cce);
        log.logFailure(cce, err);
        const error = err instanceof Error ? err.message : String(err);
        results.push({ cce, status: 'failure', error, screenshotPath });
        checkpoint.append({
          cce: cce.id,
          status: 'failure',
          error,
          screenshotPath,
          at: new Date().toISOString(),
        });
        continue; // não encerra o lote
      }
    }
  } finally {
    if (opened) await source.close();
  }

  // Consolidação final
  const xlsxPath = await buildConsolidatedXlsx(reports, cfg.consolidatedDir, cfg.consolidatedMaxSheets);
  const csvPath = buildConsolidatedCSVs(reports, cfg.consolidatedDir);
  const mdPath = writeConsolidatedMd(results, cfg.consolidatedDir);

  // Análise: empresas que saíram do Simples Nacional para o Regime Normal (EFD).
  const transitions = detectRegimeTransitions(analysisReports, cfg.regime);
  const regimeReport = await writeRegimeTransitionReport(transitions, cfg.consolidatedDir);

  // Análise: obrigatoriedade da EFD (campo OBRIGADO por Ano/Mês).
  const efdMap = detectEfdObligation(analysisReports, cfg.efd);
  const efdReport = await writeEfdObligationReport([...efdMap.values()], cfg.consolidatedDir);

  // Datas por empresa: saída do Simples (regime) + obrigatoriedade EFD (campo
  // OBRIGADO tem prioridade; senão usa a data derivada da transição de regime).
  const byCompany = transitionsByCompany(transitions);
  const dateInfo = new Map<string, DateInfo>();
  for (const [k, t] of byCompany) {
    dateInfo.set(k, { dataSaidaSimples: t.dataSaidaSimples, dataObrigEFD: t.dataObrigatoriedadeEFD });
  }
  for (const [k, e] of efdMap) {
    const cur = dateInfo.get(k) ?? { dataSaidaSimples: '', dataObrigEFD: '' };
    if (e.obrigado && e.dataInicioObrigatoriedade) cur.dataObrigEFD = e.dataInicioObrigatoriedade;
    dateInfo.set(k, cur);
  }

  // Relatório do Levantamento: todas as colunas da planilha + as duas datas.
  const levantamento = await buildLevantamentoReport(
    cfg.levantamento.sourcePath,
    cfg.levantamento.joinKey,
    dateInfo,
    cfg.consolidatedDir,
    cfg.levantamento.sheet || undefined,
  );

  const ok = results.filter((r) => r.status === 'success').length;
  const fail = results.length - ok;
  log.info(
    `Lote concluído | sucesso=${ok} | falha=${fail} | processados=${processados} | retomados=${retomados}`,
  );
  log.info(`Consolidado XLSX: ${xlsxPath}`);
  log.info(`Consolidado CSV:  ${csvPath}`);
  log.info(`Consolidado MD:   ${mdPath}`);
  log.info(`Transição Simples→Normal: ${transitions.length} empresa(s) | ${regimeReport.xlsx}`);
  log.info(
    `Obrigatoriedade EFD: ${efdReport.obrigados}/${efdReport.total} obrigados | ${efdReport.xlsx}`,
  );
  if (levantamento) {
    log.info(
      `Levantamento + datas: ${levantamento.matched}/${levantamento.totalRows} casados | ${levantamento.xlsx}`,
    );
  } else {
    log.info(
      `Levantamento: planilha de origem não encontrada em ${cfg.levantamento.sourcePath} (etapa pulada).`,
    );
  }

  // Código de saída != 0 se houve qualquer falha (útil para CI/agendadores).
  if (fail > 0) process.exitCode = 1;
}

function emptyReport(cce: CCE): NormalizedReport {
  return { cce, columns: [], rows: [], generatedAt: new Date().toISOString() };
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Erro fatal no lote:', err);
  process.exit(2);
});
