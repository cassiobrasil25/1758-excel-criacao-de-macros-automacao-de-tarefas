# Contexto — Geração de Relatórios (BOE + WebI)

> Documento de contexto/instruções internalizado a partir do projeto Claude.ai.
> Escopo: **geração de relatórios** automatizada por CCE, com extração via
> **SAP BusinessObjects Enterprise (BOE)** + **Web Intelligence (WebI)**.
>
> Este arquivo é a fonte de verdade das decisões "travadas" do `PROMPT v1.2`.
> Sem código de implementação ainda — serve como base para as próximas etapas.

---

> Conhecimento detalhado do WebI/SEFAZ-GO (interfaces, prompts, exportação em
> Excel, glossário PT-BR): ver [`webi-sefaz-go.md`](webi-sefaz-go.md).

## Ambiente / modelo de dados

- **Portal:** SEFAZ-GO — BI Launch Pad em
  `https://www.consultas.sefaz.go.gov.br/BOE/BI/custom.jsp`.
- **Modelo do relatório:** um **único documento WebI** com **prompt/parâmetro**;
  o **CCE é o valor informado no prompt**. O documento é aberto uma vez e, para
  cada CCE, o prompt é preenchido e executado (refresh).

## Decisão travada — Modo lote em sequência

No **modo lote**, o padrão é **execução em sequência (`concurrency = 1`)**, por
**estabilidade de sessão** no BOE/WebI.

## MODO LOTE — EXECUÇÃO EM SEQUÊNCIA (OBRIGATÓRIO)

- Defina `concurrency = 1`.
- Processe a lista `CCEs[]` **um por vez**, aguardando, para cada CCE:
  1. refresh/render completo do relatório;
  2. export concluído e arquivo presente em disco;
  3. geração do relatório individual;

  só então avançar para o próximo CCE.
- Em caso de falha em um CCE: **registrar erro + screenshot + continuar** o
  próximo (sem encerrar o lote).

## Trecho-modelo (pseudocódigo de referência)

```tsx
const concurrency = 1; // obrigatório
for (const cce of cces) {
  try {
    await runReportForCCE(cce);
    await exportRaw(cce);
    await parseAndNormalize(cce);
    await writeIndividualMd(cce);
    logSuccess(cce);
  } catch (err) {
    await screenshotError(cce);
    logFailure(cce, err);
    continue;
  }
}
await buildConsolidatedCSVs();
await writeConsolidatedMd();
```

## Pipeline implícito (por CCE → consolidado)

1. **`runReportForCCE`** — executa/atualiza (refresh/render) o relatório WebI do CCE.
2. **`exportRaw`** — exporta o resultado e garante o arquivo presente em disco.
3. **`parseAndNormalize`** — faz parse e normalização dos dados exportados.
4. **`writeIndividualMd`** — gera o relatório individual (Markdown) do CCE.
5. **Tratamento de falha** — `screenshotError` + `logFailure` e segue para o próximo.
6. **Consolidação final** — `buildConsolidatedCSVs` + `writeConsolidatedMd` após o loop.

## Invariantes / regras

- `concurrency = 1` é **obrigatório** (não paralelizar no modo lote).
- Cada etapa do CCE só avança após a anterior estar **comprovadamente concluída**
  (arquivo presente em disco antes de seguir).
- Falha de um CCE **não derruba o lote**: registra evidência (erro + screenshot)
  e continua.
- Consolidação (CSVs + Markdown) ocorre **somente ao final**, depois de todos os CCEs.

---

_Origem: conteúdo do projeto Claude.ai colado pelo usuário (patch final do
`PROMPT v1.2`, consistente com o ambiente BOE + WebI)._
