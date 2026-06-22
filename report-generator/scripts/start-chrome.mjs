// Lança o Google Chrome com a porta de depuração remota (CDP) para o
// report-generator conectar. Usa um perfil dedicado e persistente, então
// você loga no portal UMA vez e a sessão fica salva entre execuções.
//
//   node scripts/start-chrome.mjs        (ou: npm run chrome)
//
// Depois: faça login em https://www.consultas.sefaz.go.gov.br/BOE/BI/custom.jsp,
// abra o relatório, e rode `npm run inspect` ou `npm start`.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.CHROME_DEBUG_PORT || '9222';
const profileDir = join(homedir(), '.report-generator-chrome');
mkdirSync(profileDir, { recursive: true });

function findChrome() {
  const candidates = {
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
  };
  for (const p of candidates[platform()] || []) if (existsSync(p)) return p;
  return null;
}

const chrome = process.env.CHROME_PATH || findChrome();
if (!chrome) {
  console.error('Chrome não encontrado. Defina CHROME_PATH com o caminho do executável.');
  process.exit(1);
}

const args = [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`,
  'https://www.consultas.sefaz.go.gov.br/BOE/BI/custom.jsp',
];

console.log(`Iniciando Chrome (CDP em http://localhost:${PORT})`);
console.log(`Perfil: ${profileDir}`);
console.log('Faça login e abra o relatório. Depois rode: npm run inspect  (ou npm start)');

const child = spawn(chrome, args, { detached: true, stdio: 'ignore' });
child.unref();
