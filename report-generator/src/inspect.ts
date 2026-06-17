import * as path from 'path';
import { ensureDirs, loadConfig } from './config';

/**
 * Helper de diagnóstico: abre WEBI_BASE_URL num navegador real e imprime os
 * seletores dos campos de formulário (inputs/botões/selects), além de salvar
 * um screenshot. Use para descobrir os valores corretos de SEL_* no .env.
 *
 * Rode localmente (onde há acesso ao portal):
 *   npm run inspect
 */
async function main(): Promise<void> {
  const cfg = loadConfig();
  ensureDirs(cfg);
  if (!cfg.webi.baseUrl) throw new Error('WEBI_BASE_URL não definido (.env).');

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: cfg.webi.headless });
  const page = await browser.newPage();
  page.setDefaultTimeout(cfg.webi.timeoutMs);

  console.log(`Abrindo ${cfg.webi.baseUrl} ...`);
  await page.goto(cfg.webi.baseUrl, { waitUntil: 'networkidle' });

  const controls = await page.$$eval('input, button, select, a[role="button"]', (els) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    els.map((el: any) => {
      const tag = String(el.tagName).toLowerCase();
      return {
        tag,
        id: el.id || '',
        name: el.name || '',
        type: el.type || '',
        placeholder: el.placeholder || '',
        text: (el.textContent || '').trim().slice(0, 40),
        suggestedSelector: el.id
          ? `#${el.id}`
          : el.name
            ? `[name="${el.name}"]`
            : tag,
      };
    }),
  );

  console.log('\n=== Controles encontrados ===');
  for (const c of controls) {
    console.log(
      `${c.tag.padEnd(7)} sel=${c.suggestedSelector.padEnd(28)} type=${c.type.padEnd(10)} text="${c.text}"`,
    );
  }

  const shot = path.join(cfg.screenshotsDir, 'inspect-login.png');
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`\nScreenshot salvo em: ${shot}`);
  console.log('Preencha SEL_USERNAME / SEL_PASSWORD / SEL_LOGIN no .env com os seletores acima.');

  await browser.close();
}

main().catch((err) => {
  console.error('Falha no inspect:', err);
  process.exit(2);
});
