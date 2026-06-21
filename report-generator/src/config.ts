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
  /**
   * Rótulo que precede o campo do CCE no painel "Entrada de Prompt do Usuário".
   * O input é localizado como o primeiro <input> após esse texto (ids do WebI
   * DHTML são dinâmicos, por isso usamos texto).
   */
  promptCceLabel: string;
  /** Texto do botão que executa o prompt (ex.: "Executar"). */
  runButtonText: string;
  /** Texto do indicador de carregamento (ex.: "Recuperando dados"). */
  retrievingText: string;
  /** Texto do controle de exportação (ex.: "Exportar"). */
  exportButtonText: string;
  /** Texto da opção de formato Excel no diálogo de exportação (ex.: "Excel"). */
  exportFormatText: string;
  /**
   * Texto da opção "priorizar processamento fácil dos dados" no diálogo de
   * exportação (dados mais limpos para parse). Vazio = não clicar.
   */
  exportPriorityText: string;
  /** Texto do botão que confirma a exportação no diálogo (ex.: "Exportar"). */
  exportConfirmText: string;
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
  /** Aba do .xlsx exportado a parsear (vazio = primeira aba). */
  exportSheet: string;
  /** Configuração da análise de transição de regime (Simples -> Normal). */
  regime: {
    regimeField: string;
    companyKey: string;
    yearField: string;
    simplesPattern: RegExp;
    normalPattern: RegExp;
    saidaSimplesField?: string;
    efdObrigField?: string;
  };
  /** Relatório do Levantamento (planilha de origem + datas de regime). */
  levantamento: {
    sourcePath: string;
    joinKey: string;
    sheet: string;
  };
  /** Análise de obrigatoriedade da EFD (campo OBRIGADO por Ano/Mês). */
  efd: {
    obrigadoField: string;
    periodField: string;
    companyKey: string;
    yesPattern: RegExp;
  };
  cces: CCE[];
  webi: {
    baseUrl: string;
    /** URL do documento WebI único (openDocument). Vazio = usar baseUrl. */
    docUrl: string;
    /**
     * Endpoint CDP do Chrome já aberto (ex.: http://localhost:9222).
     * Se definido, conecta ao seu Chrome e reaproveita a sessão/relatório abertos.
     */
    cdpUrl: string;
    /** Canal do navegador ao LANÇAR (sem CDP). Padrão: "chrome". */
    channel: string;
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
    exportSheet: process.env.WEBI_EXPORT_SHEET ?? 'EFD_MOV',
    regime: {
      regimeField: process.env.REGIME_FIELD ?? 'Tipo Enquadramento',
      companyKey: process.env.REGIME_COMPANY_KEY ?? 'CNPJ',
      yearField: process.env.REGIME_YEAR_FIELD ?? 'Ano',
      simplesPattern: new RegExp(process.env.REGIME_SIMPLES_PATTERN ?? 'simples', 'i'),
      normalPattern: new RegExp(process.env.REGIME_NORMAL_PATTERN ?? 'normal', 'i'),
      saidaSimplesField: process.env.REGIME_DATE_SAIDA_SIMPLES_FIELD || undefined,
      efdObrigField: process.env.REGIME_DATE_EFD_FIELD || undefined,
    },
    levantamento: {
      sourcePath:
        process.env.LEVANTAMENTO_SOURCE_PATH ??
        path.resolve(__dirname, '..', 'config', 'levantamento.xlsx'),
      joinKey: process.env.LEVANTAMENTO_JOIN_KEY ?? 'CNPJ',
      sheet: process.env.LEVANTAMENTO_SHEET ?? '',
    },
    efd: {
      obrigadoField: process.env.EFD_OBRIGADO_FIELD ?? 'OBRIGADO',
      periodField: process.env.EFD_PERIOD_FIELD ?? 'Ano/Mês (Referência)',
      companyKey: process.env.EFD_COMPANY_KEY ?? 'CNPJ',
      yesPattern: new RegExp(process.env.EFD_YES_PATTERN ?? '^s', 'i'),
    },
    cces: loadCCEs(),
    webi: {
      baseUrl:
        process.env.WEBI_BASE_URL ??
        'https://www.consultas.sefaz.go.gov.br/BOE/BI/custom.jsp',
      docUrl: process.env.WEBI_DOC_URL ?? '',
      cdpUrl: process.env.WEBI_CHROME_CDP ?? '',
      channel: process.env.WEBI_BROWSER_CHANNEL ?? 'chrome',
      username: process.env.WEBI_USERNAME ?? '',
      password: process.env.WEBI_PASSWORD ?? '',
      headless: process.env.WEBI_HEADLESS !== 'false',
      timeoutMs: Number(process.env.WEBI_TIMEOUT_MS ?? 60000),
      // Rótulos em PT-BR observados na UI do WebI da SEFAZ-GO (ids são dinâmicos).
      selectors: {
        usernameInput: process.env.SEL_USERNAME ?? '#username',
        passwordInput: process.env.SEL_PASSWORD ?? '#password',
        loginButton: process.env.SEL_LOGIN ?? 'button[type="submit"]',
        promptCceLabel: process.env.SEL_PROMPT_CCE_LABEL ?? 'Inserir CCE',
        runButtonText: process.env.SEL_RUN_TEXT ?? 'Executar',
        retrievingText: process.env.SEL_RETRIEVING_TEXT ?? 'Recuperando dados',
        exportButtonText: process.env.SEL_EXPORT_TEXT ?? 'Exportar',
        exportFormatText: process.env.SEL_EXPORT_FORMAT_TEXT ?? 'Excel',
        exportPriorityText: process.env.SEL_EXPORT_PRIORITY_TEXT ?? '',
        exportConfirmText: process.env.SEL_EXPORT_CONFIRM_TEXT ?? 'Exportar',
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
