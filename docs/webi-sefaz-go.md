# Conhecimento — SAP BusinessObjects Web Intelligence (SEFAZ-GO)

> Síntese operacional aprendida dos materiais do projeto (pasta Google Drive):
> Guia Oficial *Web Intelligence User's Guide* (BI 4.0 SP5), *Manual do WI –
> BusinessObjects XI R2* (SIF/GIT/SEFAZ-GO, 2007) e os slides de treinamento da
> SEFAZ-GO. Foco: o que importa para **gerar relatórios por CCE e exportar em
> Excel** de forma automatizada.

## Interfaces do WebI

- **BI Launch Pad** (antes "InfoView"): portal de onde se abre/visualiza/edita
  documentos. Login com **Nome de Usuário** + **Senha**.
- Três ferramentas de autoria: **Painel de Relatórios Java**, **Consulta HTML**
  e **Painel de Relatórios HTML**. O portal da SEFAZ-GO usa o **viewer DHTML/HTML**.
- Modos de um documento: **Leitura** (visualização) e **Design/Edição**.

## Prompts (solicitações) — como o CCE entra

- Um filtro de consulta pode ser definido como **"Exibe uma pergunta a cada vez
  que a consulta é atualizada"** — isto é um **prompt**. O valor é informado no
  momento da execução.
- Na tela da SEFAZ-GO, isso aparece no painel **"Entrada de Prompt do Usuário"**
  com campos como **"Inserir CCE:"**, "Inserir valores para Ano (Referência)",
  "Inserir valores para Gerência Centralizada Regional" e o botão **"Executar"**.
- **"Atualizar"** (refresh) reexecuta a consulta; se o documento tem prompts,
  eles são exibidos antes. A propriedade **"Atualizar ao abrir"** ("Refresh on
  open") faz o documento atualizar os dados ao ser aberto.

## Exportar / salvar em Excel (o que usamos)

Formatos disponíveis: **PDF, Excel, Excel 2007 (.xlsx), Texto, CSV**.

- **Interface HTML**: ao salvar o documento como Excel, pode-se **selecionar
  quais relatórios (abas)** salvar, ou **"Selecionar tudo"**. **Cada relatório
  (aba) do documento é salvo como uma planilha (worksheet) separada** no arquivo
  Excel.
- Duas prioridades no diálogo de exportação:
  - **"Priorizar a formatação dos documentos"** — mantém o layout/visual, mas
    sacrifica o processamento dos dados.
  - **"Priorizar o processamento fácil dos dados"** — produz dados mais limpos
    (recomendado para **parse automatizado**).
- **Interface Java/Rich Client**: clique com botão direito na aba do relatório →
  **"Exportar Relatório Atual Como"** → Excel / Excel 2007 / Texto / PDF.
- CSV tem opções próprias: qualificador de texto, delimitador de coluna e
  conjunto de caracteres.

## Implicações para esta automação (report-generator)

1. **Escolher a aba certa.** Como cada aba vira um worksheet, o parse precisa
   saber **qual aba** ler. As abas observadas no relatório da SEFAZ-GO são:
   `EFD_MOV`, `Mov_CFOP_S`, `MOV_CFOP_E`, `APur`, `APur_ST`, `ARREC`,
   `AJUSTE_APUR`, `Aju...`. Default adotado: **`EFD_MOV`** (`WEBI_EXPORT_SHEET`).
2. **Exportar como Excel 2007 (.xlsx)** para o parse com `exceljs`.
3. **Priorizar processamento fácil dos dados** no diálogo de exportação, quando
   disponível (`SEL_EXPORT_PRIORITY_TEXT`), para dados mais limpos.
4. **Prompt do CCE**: preencher "Inserir CCE" e clicar "Executar"; aguardar o
   ciclo "Recuperando dados". Demais prompts (Ano, Gerência) ficam com os
   valores já definidos no documento, salvo necessidade de parametrizar também.

## Glossário PT-BR ↔ EN

| PT-BR (SEFAZ-GO) | EN (guia oficial) |
| --- | --- |
| Atualizar | Refresh |
| Entrada de Prompt do Usuário | Prompt entry |
| Executar | Run / Run queries |
| Recuperando dados | Retrieving data |
| Exportar / Salvar | Export / Save |
| Painel de consulta | Query panel |
| Provedor de dados | Data provider |
| Universo | Universe |
| Indicador / Dimensão / Detalhe | Measure / Dimension / Detail |

_Materiais lidos: slides de treinamento (100%); Guia Oficial e Manual SEFAZ
(seções de exportação/prompts/atualização). Dashboards/Xcelsius não lido (fora
de escopo)._
