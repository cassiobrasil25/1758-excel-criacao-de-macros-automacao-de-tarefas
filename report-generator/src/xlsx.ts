import ExcelJS from 'exceljs';

export interface SheetData {
  name: string;
  columns: string[];
  rows: Record<string, string>[];
}

/** Lê uma planilha .xlsx: 1ª linha = cabeçalho. `sheet` opcional (nome). */
export async function readXlsx(
  filePath: string,
  sheet?: string,
): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = sheet ? wb.getWorksheet(sheet) : wb.worksheets[0];
  if (!ws) return { columns: [], rows: [] };
  const { columns, rows } = extractSheet(ws);
  return { columns, rows };
}

/** Lê TODAS as abas de um .xlsx (1ª linha = cabeçalho em cada uma). */
export async function readXlsxAllSheets(filePath: string): Promise<SheetData[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  return wb.worksheets.map((ws) => ({ name: ws.name, ...extractSheet(ws) }));
}

function extractSheet(ws: ExcelJS.Worksheet): { columns: string[]; rows: Record<string, string>[] } {
  let columns: string[] = [];
  const rows: Record<string, string>[] = [];
  ws.eachRow((row, rowNumber) => {
    const values = (row.values as unknown[]).slice(1).map(cellToString);
    if (rowNumber === 1) {
      columns = values.map((v, i) => (v.trim() ? v.trim() : `col${i + 1}`));
    } else {
      const obj: Record<string, string> = {};
      columns.forEach((c, i) => {
        obj[c] = values[i] ?? '';
      });
      rows.push(obj);
    }
  });
  return { columns, rows };
}

/** Escreve um .xlsx com uma ou mais abas (1ª linha = cabeçalho). */
export async function writeXlsx(filePath: string, sheets: SheetData[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets.length ? sheets : [{ name: 'Dados', columns: [], rows: [] }]) {
    const ws = wb.addWorksheet(sanitizeSheetName(s.name));
    if (s.columns.length) {
      ws.addRow(s.columns);
      ws.getRow(1).font = { bold: true };
      for (const r of s.rows) ws.addRow(s.columns.map((c) => r[c] ?? ''));
    }
  }
  await wb.xlsx.writeFile(filePath);
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map((t) => t.text ?? '').join('');
    }
    if (o.result !== undefined) return String(o.result);
    if (o.hyperlink !== undefined) return String(o.text ?? o.hyperlink);
    return String(v);
  }
  return String(v);
}

/** Nome de aba válido no Excel: <=31 chars, sem []:*?/\\ */
function sanitizeSheetName(name: string): string {
  return name.replace(/[\[\]:*?/\\]/g, '_').slice(0, 31) || 'Dados';
}
