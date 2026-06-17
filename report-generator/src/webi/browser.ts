import * as path from 'path';
import type { AppConfig } from '../config';
import type { CCE, RawExport, ReportSource } from '../types';

/**
 * WebiBrowserSource — dirige a UI web do WebI (BI Launch Pad) via Playwright.
 *
 * IMPORTANTE: os seletores e a navegação variam por versão do SAP BO/WebI.
 * Os pontos marcados com `TODO(webi)` devem ser ajustados ao seu ambiente
 * (config/.env → AppConfig.webi.selectors). A estrutura segue exatamente o
 * pipeline travado: runReportForCCE → exportRaw, com screenshot em falha.
 *
 * O Playwright é importado dinamicamente para que o modo mock rode sem ter
 * os navegadores instalados.
 */
export class WebiBrowserSource implements ReportSource {
  private browser: import('playwright').Browser | undefined;
  private context: import('playwright').BrowserContext | undefined;
  private page: import('playwright').Page | undefined;

  constructor(private readonly cfg: AppConfig) {}

  async open(): Promise<void> {
    const { chromium } = await import('playwright');
    const { webi } = this.cfg;
    if (!webi.baseUrl) throw new Error('WEBI_BASE_URL não definido (.env).');

    this.browser = await chromium.launch({ headless: webi.headless });
    this.context = await this.browser.newContext({ acceptDownloads: true });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(webi.timeoutMs);

    await this.login();
  }

  private async login(): Promise<void> {
    const page = this.requirePage();
    const { webi } = this.cfg;
    const sel = webi.selectors;

    await page.goto(webi.baseUrl, { waitUntil: 'domcontentloaded' });
    // TODO(webi): ajustar fluxo de login conforme seu BI Launch Pad / SSO.
    if (webi.username) {
      await page.fill(sel.usernameInput, webi.username);
      await page.fill(sel.passwordInput, webi.password);
      await page.click(sel.loginButton);
      await page.waitForLoadState('networkidle');
    }
  }

  /** (1) refresh/render completo do relatório do CCE. */
  async runReportForCCE(cce: CCE): Promise<void> {
    const page = this.requirePage();
    const sel = this.cfg.webi.selectors;

    // TODO(webi): abrir o documento do CCE. Estratégia comum: navegar para a
    // URL do documento (openDocument) usando cce.docId, ou pesquisar pelo id.
    if (cce.docId) {
      const url = new URL(this.cfg.webi.baseUrl);
      url.searchParams.set('sDocName', cce.docId);
      await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    }

    // Dispara o refresh e aguarda a CONCLUSÃO (não apenas o clique).
    await page.click(sel.refreshButton);
    await page.waitForSelector(sel.refreshDoneIndicator, { state: 'visible' });
  }

  /** (2) export concluído e arquivo presente em disco. */
  async exportRaw(cce: CCE): Promise<RawExport> {
    const page = this.requirePage();
    const sel = this.cfg.webi.selectors;
    const filePath = path.join(this.cfg.rawDir, `${cce.id}.csv`);

    // Aguarda o evento de download disparado pelo botão de export.
    const downloadPromise = page.waitForEvent('download');
    await page.click(sel.exportButton);
    // TODO(webi): se houver diálogo de formato (CSV/XLSX), selecionar aqui.
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
    await this.context?.close();
    await this.browser?.close();
  }

  private requirePage(): import('playwright').Page {
    if (!this.page) throw new Error('Sessão WebI não inicializada (chame open() antes).');
    return this.page;
  }
}
