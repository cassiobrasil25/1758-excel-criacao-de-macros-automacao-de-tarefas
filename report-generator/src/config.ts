import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import type { CCE } from './types';

dotenv.config();

/** concurrency é OBRIGATORIAMENTE 1 (regra travada — estabilidade de sessão BOE/WebI). */
export const CONCURRENCY = 1 as const;

export type Mode = 'webi' | 'mock';

export interface WebiSelectors {
  usernameInput: string;
  passwordInput: string;
  loginButton: string;
  refreshButton: string;
  /** Campo do diálogo de prompts onde o CCE é informado. */
  promptInput: string;
  /** Botão opcional "adicionar valor" do prompt (seta ">"). Vazio = não usar. */
  promptAddButton: string;
  /** Botão de executar/OK do diálogo de prompts. */
  promptRunButton: string;
  refreshDoneIndicator: string;
  exportButton: string;
}

export interface AppConfig {
  mode: Mode;
  /** Diretório raiz de saída em tempo de execução (ignorado pelo git). */
  runtimeDir: string;
  rawDir: string;
  reportsDir: string;
  screenshotsDir: string;
  logsDir: string;
  consolidatedDir: string;
  cces: CCE[];
  webi: {
    baseUrl: string;
    /** URL do documento WebI único (openDocument). Vazio = usar baseUrl. */
    docUrl: string;
    username: string;
    password: string;
    headless: boolean;
    timeoutMs: number;
    selectors: WebiSelectors;
  };
}

function loadCCEs(): CCE[] {
  const configPath = path.resolve(__dirname, '..', 'config', 'cces.json');
  if (fs.existsSync(configPath)) {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('config/cces.json deve ser um array de CCEs.');
    return parsed as CCE[];
  }
  // Fallback: variável de ambiente CCES="A001,A002,A003"
  const env = process.env.CCES;
  if (env) {
    return env
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((id) => ({ id }));
  }
  throw new Error('Nenhum CCE configurado: crie config/cces.json ou defina a env CCES.');
}

export function loadConfig(): AppConfig {
  const mode = (process.env.MODE === 'mock' ? 'mock' : 'webi') as Mode;
  const runtimeDir = path.resolve(__dirname, '..', 'runtime');

  return {
    mode,
    runtimeDir,
    rawDir: path.join(runtimeDir, 'raw'),
    reportsDir: path.join(runtimeDir, 'reports'),
    screenshotsDir: path.join(runtimeDir, 'screenshots'),
    logsDir: path.join(runtimeDir, 'logs'),
    consolidatedDir: path.join(runtimeDir, 'consolidated'),
    cces: loadCCEs(),
    webi: {
      baseUrl:
        process.env.WEBI_BASE_URL ??
        'https://www.consultas.sefaz.go.gov.br/BOE/BI/custom.jsp',
      docUrl: process.env.WEBI_DOC_URL ?? '',
      username: process.env.WEBI_USERNAME ?? '',
      password: process.env.WEBI_PASSWORD ?? '',
      headless: process.env.WEBI_HEADLESS !== 'false',
      timeoutMs: Number(process.env.WEBI_TIMEOUT_MS ?? 60000),
      // Seletores variam por versão do BI Launch Pad / WebI — ajuste no .env.
      selectors: {
        usernameInput: process.env.SEL_USERNAME ?? '#username',
        passwordInput: process.env.SEL_PASSWORD ?? '#password',
        loginButton: process.env.SEL_LOGIN ?? 'button[type="submit"]',
        refreshButton: process.env.SEL_REFRESH ?? '[title="Refresh"]',
        promptInput: process.env.SEL_PROMPT_INPUT ?? '.promptValue input',
        promptAddButton: process.env.SEL_PROMPT_ADD ?? '',
        promptRunButton: process.env.SEL_PROMPT_RUN ?? '[title="Run"]',
        refreshDoneIndicator: process.env.SEL_REFRESH_DONE ?? '.refresh-complete',
        exportButton: process.env.SEL_EXPORT ?? '[title="Export"]',
      },
    },
  };
}

export function ensureDirs(cfg: AppConfig): void {
  for (const dir of [
    cfg.runtimeDir,
    cfg.rawDir,
    cfg.reportsDir,
    cfg.screenshotsDir,
    cfg.logsDir,
    cfg.consolidatedDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
