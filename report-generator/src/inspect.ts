import * as path from 'path';
import { ensureDirs, loadConfig } from './config';

/**
 * Helper de diagnóstico para finalizar os seletores do WebI.
 *
 * Modo CDP (recomendado): com WEBI_CHROME_CDP definido, conecta ao seu Chrome
 * já aberto/logado e despeja a estrutura da TELA ATUAL (todos os iframes) —
 * use com o relatório aberto, ou com o diálogo de "Exportar" aberto, para
 * capturar os rótulos/controles reais.
 *
 * Modo Launch: sem CDP, abre a baseUrl num Chrome novo (útil só p/ login).
 *
 * Rode localmente (onde há acesso ao portal):
 *   npm run inspect
 */
async function main(): Promise<void> {
  const cfg = loadConfig();
  ensureDirs(cfg);

  const { chromium } = await import('playwright');
  let page: import('playwright').Page;
  let cleanup: () => Promise<void>;

  if (cfg.webi.cdpUrl) {
    console.log(`Conectando ao Chrome via CDP: ${cfg.webi.cdpUrl}`);
    const browser = await chromium.connectOverCDP(cfg.webi.cdpUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    page = context.pages()[0] ?? (await context.newPage());
    cleanup = async () => {
      await browser.close().catch(() => undefined);
    };
    console.log(`Página atual: ${page.url()}`);
  } else {
    if (!cfg.webi.baseUrl) throw new Error('WEBI_BASE_URL não definido (.env).');
    const browser = await chromium.launch({ headless: cfg.webi.headless, channel: cfg.webi.channel });
    page = await browser.newPage();
    cleanup = async () => {
      await browser.close().catch(() => undefined);
    };
    console.log(`Abrindo ${cfg.webi.baseUrl} ...`);
    await page.goto(cfg.webi.baseUrl, { waitUntil: 'networkidle' });
  }
  page.setDefaultTimeout(cfg.webi.timeoutMs);

  // A UI do WebI DHTML vive em iframes — varre todos os frames.
  for (const frame of page.frames()) {
    let controls: Array<Record<string, string>> = [];
    try {
      controls = await frame.$$eval(
        'input, button, select, a[role="button"], [role="button"], label',
        (els) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          els.map((el: any) => {
            const tag = String(el.tagName).toLowerCase();
            return {
              tag,
              type: el.type || '',
              text: (el.textContent || el.value || el.title || '').trim().slice(0, 50),
              suggestedSelector: el.id
                ? `#${el.id}`
                : el.name
                  ? `[name="${el.name}"]`
                  : tag,
            };
          }),
      );
    } catch {
      continue; // frame cross-origin/destacado
    }
    if (controls.length === 0) continue;
    console.log(`\n=== Frame: ${frame.url().slice(0, 90)} ===`);
    for (const c of controls) {
      console.log(
        `${c.tag.padEnd(7)} sel=${c.suggestedSelector.padEnd(26)} type=${c.type.padEnd(8)} text="${c.text}"`,
      );
    }
  }

  const shot = path.join(cfg.screenshotsDir, 'inspect.png');
  await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
  console.log(`\nScreenshot salvo em: ${shot}`);
  console.log('Use a saída para confirmar SEL_PROMPT_CCE_LABEL / SEL_RUN_TEXT / SEL_EXPORT_* no .env.');

  await cleanup();
}

main().catch((err) => {
  console.error('Falha no inspect:', err);
  process.exit(2);
});
