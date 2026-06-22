import * as fs from 'fs';

/** Uma entrada do checkpoint (uma por CCE concluído). */
export interface CheckpointEntry {
  cce: string;
  status: 'success' | 'failure';
  rowCount?: number;
  error?: string;
  screenshotPath?: string;
  individualReportPath?: string;
  rawPath?: string;
  at: string;
}

/**
 * Checkpoint incremental em JSONL (uma linha por CCE concluído). Append é
 * atômico o suficiente para sobreviver a quedas: ao retomar, relê as linhas e
 * pula os CCEs já concluídos com sucesso (reprocessando os que falharam).
 */
export class Checkpoint {
  constructor(private readonly file: string) {}

  /** Mapa cce -> última entrada registrada. */
  load(): Map<string, CheckpointEntry> {
    const map = new Map<string, CheckpointEntry>();
    if (!fs.existsSync(this.file)) return map;
    for (const line of fs.readFileSync(this.file, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const e = JSON.parse(t) as CheckpointEntry;
        if (e && e.cce) map.set(e.cce, e); // última ocorrência vence
      } catch {
        /* linha corrompida (queda no meio da escrita) — ignora */
      }
    }
    return map;
  }

  append(entry: CheckpointEntry): void {
    fs.appendFileSync(this.file, JSON.stringify(entry) + '\n');
  }
}
