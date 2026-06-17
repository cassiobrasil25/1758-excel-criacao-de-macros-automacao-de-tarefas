# report-generator

Geração de relatórios em **lote** por CCE a partir do **SAP BusinessObjects (BOE) + Web Intelligence (WebI)**, seguindo as regras travadas em [`../docs/contexto-relatorios.md`](../docs/contexto-relatorios.md) (PROMPT v1.2).

## Regra principal

**Execução em sequência — `concurrency = 1`** (obrigatório), por estabilidade de sessão no BOE/WebI. Para cada CCE, o pipeline aguarda cada etapa concluir antes de avançar:

1. `runReportForCCE` — refresh/render completo do relatório
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

### Modo mock

Não acessa o BOE: gera um CSV bruto sintético por CCE e roda todo o pipeline (parse → relatório individual → consolidação). Útil para validar a lógica e em CI. CCEs com id iniciando em `FAIL` falham de propósito, exercitando o caminho de erro (`screenshot + log + continua`).

## Adaptação ao seu WebI

`src/webi/browser.ts` tem pontos marcados com `TODO(webi)`: fluxo de login/SSO, abertura do documento por CCE (`openDocument`/`sDocName`), indicador de "refresh concluído" e diálogo de formato no export. Seletores ficam em `.env` (`SEL_*`) porque variam por versão do BI Launch Pad.
