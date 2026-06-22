import * as path from 'path';
import type { AppConfig } from '../config';
import type { CCE, RawExport, ReportSource } from '../types';

type PwBrowser = import('playwright').Browser;
type PwContext = import('playwright').BrowserContext;
type PwPage = import('playwright').Page;
type PwFrame = import('playwright').Frame;

/**
 * WebiBrowserSource — dirige o WebI DHTML da SEFAZ-GO no Google Chrome.
 *
 * Modelo (confirmado por screenshot): UM documento WebI com prompts; o painel
 * "Entrada de Prompt do Usuário" tem o campo "Inserir CCE:" e o botão
 * "Executar". Ao executar surge "Recuperando dados" (some quando conclui).
 *
 * Estratégia de robustez: os ids do WebI DHTML são dinâmicos, então localizamos
 * por TEXTO/RÓTULO em PT-BR e varremos os iframes para achar o frame certo.
 *
 * Dois modos de Chrome:
 *  - CDP (recomendado): conecta ao seu Chrome já aberto e logado
 *    (WEBI_CHROME_CDP=http://localhost:9222) e reaproveita o relatório aberto.
 *  - Launch: abre um Chrome novo (channel "chrome") e faz login.
 */
export class WebiBrowserSource implements ReportSource {
  private browser: PwBrowser | undefined;
  private context: PwContext | undefined;
  private page: PwPage | undefined;
  private connectedExisting = false;
  /** O documento é o mesmo para todos os CCEs — preparado uma única vez. */
  private docReady = false;

  constructor(private readonly cfg: AppConfig) {}

  async open(): Promise<void> {
    const { chromium } = await import('playwright');
    const { webi } = this.cfg;

    if (webi.cdpUrl) {
      // Conecta ao Chrome já aberto/logado pelo usuário.
      this.browser = await chromium.connectOverCDP(webi.cdpUrl);
      this.context = this.browser.contexts()[0] ?? (await this.browser.newContext());
      this.page = this.context.pages()[0] ?? (await this.context.newPage());
      this.connectedExisting = true;
    } else {
      // Lança um Chrome novo (Google Chrome via channel) e faz login.
      this.browser = await chromium.launch({ headless: webi.headless, channel: webi.channel });
      this.context = await this.browser.newContext({ acceptDownloads: true });
      this.page = await this.context.newPage();
      await this.login();
    }
    this.page.setDefaultTimeout(webi.timeoutMs);
  }

  private async login(): Promise<void> {
    const page = this.requirePage();
    const { webi } = this.cfg;
    const sel = webi.selectors;
    if (!webi.baseUrl) throw new Error('WEBI_BASE_URL não definido (.env).');

    await page.goto(webi.baseUrl, { waitUntil: 'domcontentloaded' });
    // TODO(webi): confirmar fluxo de login da SEFAZ-GO (rode `npm run inspect`).
    if (webi.username) {
      await page.fill(sel.usernameInput, webi.username);
      await page.fill(sel.passwordInput, webi.password);
      await page.click(sel.loginButton);
      await page.waitForLoadState('networkidle');
    }
  }

  /** Garante o documento aberto (uma vez). */
  private async ensureDocReady(): Promise<void> {
    if (this.docReady) return;
    const page = this.requirePage();
    const { webi } = this.cfg;

    if (webi.docUrl) {
      await page.goto(webi.docUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
    } else if (!this.connectedExisting && webi.baseUrl) {
      await page.goto(webi.baseUrl, { waitUntil: 'domcontentloaded' });
    }
    // No modo CDP sem docUrl, assume-se que o relatório já está aberto na aba.
    this.docReady = true;
  }

  /**
   * (1) Informa o CCE no prompt e dispara o render, aguardando a CONCLUSÃO.
   * Mira o painel "Entrada de Prompt do Usuário" → campo "Inserir CCE:" → "Executar".
   */
  async runReportForCCE(cce: CCE): Promise<void> {
    await this.ensureDocReady();
    const sel = this.cfg.webi.selectors;

    // Acha o frame que contém o rótulo "Inserir CCE".
    const frame = await this.findFrameWith(sel.promptCceLabel);

    // O input do CCE é o primeiro <input> de texto após o rótulo.
    const input = frame
      .locator(
        `xpath=//*[contains(normalize-space(.), ${xpathLiteral(sel.promptCceLabel)})]` +
          `/following::input[not(@type) or @type="text"][1]`,
      )
      .first();
    await input.waitFor({ state: 'visible' });
    await input.fill('');
    await input.fill(String(cce.id));

    // Clica em "Executar".
    await this.clickByText(frame, sel.runButtonText);

    // Aguarda o ciclo de "Recuperando dados": aparece e depois some.
    const retrieving = frame.getByText(sel.retrievingText, { exact: false }).first();
    await retrieving.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    await retrieving.waitFor({ state: 'hidden' }).catch(() => undefined);
  }

  /**
   * (2) Exporta o resultado renderizado em EXCEL (.xlsx) e garante o arquivo
   * em disco. Fluxo: abrir "Exportar" → escolher formato "Excel" → confirmar →
   * capturar o download.
   *
   * TODO(webi): confirmar em tela o diálogo de exportação (rótulos do formato
   * "Excel" e do botão de confirmação, e eventual seleção de abas). Os textos
   * são configuráveis via SEL_EXPORT_*.
   */
  async exportRaw(cce: CCE): Promise<RawExport> {
    const page = this.requirePage();
    const sel = this.cfg.webi.selectors;
    const filePath = path.join(this.cfg.rawDir, `${cce.id}.xlsx`);

    // Abre o diálogo de exportação.
    let frame = await this.findFrameWith(sel.exportButtonText).catch(() => page.mainFrame());
    await this.clickByText(frame, sel.exportButtonText);

    // Seleciona o formato Excel (se o diálogo oferecer a opção).
    frame = await this.findFrameWith(sel.exportFormatText).catch(() => frame);
    await this.clickByText(frame, sel.exportFormatText).catch(() => undefined);

    // Prioriza "processamento fácil dos dados" (dados mais limpos p/ parse), se configurado.
    if (sel.exportPriorityText) {
      await this.clickByText(frame, sel.exportPriorityText).catch(() => undefined);
    }

    // Confirma e captura o download.
    const downloadPromise = page.waitForEvent('download');
    await this.clickByText(frame, sel.exportConfirmText);
    const download = await downloadPromise;
    await download.saveAs(filePath);

    return { cce, filePath };
  }

  async screenshotError(cce: CCE): Promise<string | undefined> {
    if (!this.page) return undefined;
    const file = path.join(this.cfg.screenshotsDir, `erro-${cce.id}-${Date.now()}.png`);
    try {
      await this.page.screenshot({ path: file, fullPage: true });
      return file;
    } catch {
      return undefined;
    }
  }

  async close(): Promise<void> {
    // Se conectamos a um Chrome existente do usuário, não o fechamos.
    if (this.connectedExisting) {
      await this.browser?.close().catch(() => undefined); // só desconecta o CDP
      return;
    }
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
  }

  /** Varre todos os frames até achar um que contenha o texto dado. */
  private async findFrameWith(text: string): Promise<PwFrame> {
    const page = this.requirePage();
    const deadline = Date.now() + this.cfg.webi.timeoutMs;
    while (Date.now() < deadline) {
      for (const frame of page.frames()) {
        try {
          if (await frame.getByText(text, { exact: false }).count()) return frame;
        } catch {
          /* frame destacado durante a varredura — ignora */
        }
      }
      await page.waitForTimeout(500);
    }
    throw new Error(`Não encontrei nenhum frame contendo "${text}".`);
  }

  /** Clica por papel de botão; se não houver, clica pelo texto visível. */
  private async clickByText(frame: PwFrame, text: string): Promise<void> {
    const byRole = frame.getByRole('button', { name: text, exact: false }).first();
    if (await byRole.count()) {
      await byRole.click();
      return;
    }
    await frame.getByText(text, { exact: false }).first().click();
  }

  private requirePage(): PwPage {
    if (!this.page) throw new Error('Sessão WebI não inicializada (chame open() antes).');
    return this.page;
  }
}

/** Escapa um texto para uso seguro como literal em XPath. */
function xpathLiteral(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  return 'concat(' + value.split('"').map((p) => `"${p}"`).join(', \'"\', ') + ')';
}
