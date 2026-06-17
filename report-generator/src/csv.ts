/** Utilitários mínimos de CSV (sem dependências externas). */

/** Faz parse de um conteúdo CSV em linhas de objetos, respeitando aspas. */
export function parseCsv(content: string): { columns: string[]; rows: Record<string, string>[] } {
  const records = tokenize(content);
  if (records.length === 0) return { columns: [], rows: [] };
  const columns = records[0];
  const rows = records.slice(1).map((rec) => {
    const row: Record<string, string> = {};
    columns.forEach((col, i) => {
      row[col] = rec[i] ?? '';
    });
    return row;
  });
  return { columns, rows };
}

/** Serializa colunas + linhas em CSV (aspas quando necessário). */
export function toCsv(columns: string[], rows: Record<string, string>[]): string {
  const head = columns.map(escapeField).join(',');
  const body = rows.map((row) => columns.map((c) => escapeField(row[c] ?? '')).join(','));
  return [head, ...body].join('\n') + '\n';
}

function escapeField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/** Tokeniza CSV em matriz de campos, suportando aspas e quebras de linha. */
function tokenize(content: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  // último campo/linha (se houver conteúdo pendente)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
