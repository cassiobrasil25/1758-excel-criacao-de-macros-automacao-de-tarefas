# report-generator

Geração de relatórios em **lote** por CCE a partir do **SAP BusinessObjects (BOE) + Web Intelligence (WebI)**, seguindo as regras travadas em [`../docs/contexto-relatorios.md`](../docs/contexto-relatorios.md) (PROMPT v1.2).

## Modelo (SEFAZ-GO / WebI DHTML)

Há **um único documento WebI** com prompts; no painel **"Entrada de Prompt do Usuário"** informa-se o **CCE** no campo **"Inserir CCE:"** e clica-se em **"Executar"**. Surge **"Recuperando dados"** durante o render (some quando conclui). A automação mira por **texto/rótulo** (PT-BR), pois os ids do WebI DHTML são dinâmicos, e varre os **iframes** da página.

## Executar no Google Chrome (passo a passo)

Como você já acessa o portal logado, o caminho mais estável é conectar ao seu Chrome via porta de depuração e reaproveitar a sessão/relatório abertos.

```bash
cd report-generator
npm install
npx playwright install chromium   # só p/ o driver do Playwright

# 1) Abre o Chrome com porta de depuração + perfil dedicado (persiste o login):
npm run chrome
#    -> faça login no portal e abra o relatório nessa janela.

# 2) Configure (uma vez):
cp .env.example .env                            # já vem WEBI_CHROME_CDP=http://localhost:9222
cp config/cces.example.json config/cces.json    # ponha os CCEs reais (ex.: 108060349)

# 3) Descubra/confirme os seletores reais da tela:
npm run inspect          # despeja os controles de todos os iframes + screenshot

# 4) Rode o lote:
npm start
```

> Se `npm run chrome` não achar o Chrome, defina `CHROME_PATH` com o caminho do executável.

### Capturar o diálogo de "Exportar"

Para finalizar a exportação em Excel, **abra o diálogo de Exportar na janela do Chrome** (clique em Exportar e escolha Excel, sem confirmar) e então rode `npm run inspect` — ele despeja os rótulos/controles do diálogo aberto. Ajuste `SEL_EXPORT_FORMAT_TEXT` e `SEL_EXPORT_CONFIRM_TEXT` no `.env` conforme a saída.

Alternativa (sem CDP): deixe `WEBI_CHROME_CDP` vazio — o script **lança** um Chrome novo (`channel: chrome`) e faz login com `WEBI_USERNAME`/`WEBI_PASSWORD`.

## Regra principal

**Execução em sequência — `concurrency = 1`** (obrigatório), por estabilidade de sessão no BOE/WebI. Para cada CCE, o pipeline aguarda cada etapa concluir antes de avançar:

1. `runReportForCCE` — informa o CCE no prompt e dispara refresh/render completo
2. `exportRaw` — export concluído e **arquivo presente em disco**
3. `parseAndNormalize` — parse + normalização
4. `writeIndividualMd` — relatório individual (Markdown)

Falha em um CCE → **registra erro + screenshot + continua** o próximo (não encerra o lote). Ao final: `buildConsolidatedCSVs` + `writeConsolidatedMd`.

## Estrutura

```
src/
  index.ts              # orquestrador: laço sequencial (concurrency = 1)
  config.ts             # env + lista de CCEs + seletores
  logger.ts             # logSuccess / logFailure (console + arquivo)
  csv.ts                # parse/serialização CSV (sem deps)
  transform/parse.ts    # parseAndNormalize
  output/individual.ts  # writeIndividualMd
  output/consolidated.ts# buildConsolidatedCSVs + writeConsolidatedMd
  webi/browser.ts       # WebiBrowserSource (Playwright) — ajuste os seletores
  webi/mock.ts          # MockSource — roda sem BOE (testes/CI)
```

Saídas vão para `runtime/` (ignorado pelo git): `raw/`, `reports/`, `screenshots/`, `logs/`, `consolidated/`.

### Relatório: Simples Nacional → Regime Normal (EFD)

Ao final do lote é gerada automaticamente a análise das **empresas que eram do
Simples Nacional e passaram para o Regime Normal** (logo, obrigadas à EFD):
`runtime/consolidated/transicao-simples-normal.xlsx` (e `.md`).

Critério: por **CNPJ**, comparando o regime na coluna **"Tipo Enquadramento"**
ao longo dos **anos** — a empresa entra no relatório se teve Simples num ano e
Normal num ano posterior. Campos e padrões são configuráveis via `REGIME_*` no
`.env` (coluna do regime, identificador, coluna de ano, regex de cada regime).

O relatório inclui a **data em que deixou o Simples** e a **data de
obrigatoriedade da EFD**. Se os dados extraídos tiverem colunas de data
explícitas, configure `REGIME_DATE_SAIDA_SIMPLES_FIELD` / `REGIME_DATE_EFD_FIELD`;
senão, as datas são derivadas dos anos (31/12 do último ano Simples; 01/01 do
primeiro ano Normal).

### Relatório do Levantamento (planilha + as duas datas)

Enriquece uma planilha de origem (ex.: *Levantamento de Autos*) repassando
**todas as colunas** dela e acrescentando **Data Saída Simples Nacional** e
**Data Obrigatoriedade EFD**, casadas por CNPJ (normalizado por dígitos). Saída:
`runtime/consolidated/levantamento-com-datas.xlsx`.

Configure em `.env`: `LEVANTAMENTO_SOURCE_PATH` (caminho do `.xlsx` — converta o
`.xls` para `.xlsx`), `LEVANTAMENTO_JOIN_KEY` (padrão `CNPJ`) e
`LEVANTAMENTO_SHEET` (aba; vazio = primeira). Se o arquivo não existir, a etapa
é pulada sem erro.

## Como usar

```bash
npm install                 # instala deps
npx playwright install chromium   # só para o modo webi (browser real)

# 1) Configure os CCEs
cp config/cces.example.json config/cces.json   # edite com seus CCEs

# 2) Configure o ambiente
cp .env.example .env                            # edite WEBI_* e seletores

# 3) Execute
npm start                   # modo webi (precisa do .env e do browser)
npm run start:mock          # modo mock (sem BOE — valida a orquestração)
```

### Descobrindo os seletores do seu WebI

O portal padrão é o da **SEFAZ-GO** (`https://www.consultas.sefaz.go.gov.br/BOE/BI/custom.jsp`),
mas a página de login é customizada e protegida por WAF — os seletores precisam
ser confirmados no seu ambiente. Rode (localmente, com acesso ao portal):

```bash
npm run inspect
```

Ele abre a página, lista os controles (id/name/type de cada input e botão) e
salva um screenshot em `runtime/screenshots/inspect-login.png`. Use a saída
para preencher `SEL_USERNAME`, `SEL_PASSWORD` e `SEL_LOGIN` no `.env`.

### Modo mock

Não acessa o BOE: gera um CSV bruto sintético por CCE e roda todo o pipeline (parse → relatório individual → consolidação). Útil para validar a lógica e em CI. CCEs com id iniciando em `FAIL` falham de propósito, exercitando o caminho de erro (`screenshot + log + continua`).

## Adaptação ao seu WebI

`src/webi/browser.ts` tem pontos marcados com `TODO(webi)`: fluxo de login/SSO, abertura do documento por CCE (`openDocument`/`sDocName`), indicador de "refresh concluído" e diálogo de formato no export. Seletores ficam em `.env` (`SEL_*`) porque variam por versão do BI Launch Pad.
