import * as fs from 'fs';
import * as path from 'path';
import type { CCE } from './types';

/** Logger simples: console + arquivo de log do run. */
export class RunLogger {
  private readonly logFile: string;

  constructor(logsDir: string) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(logsDir, `run-${stamp}.log`);
  }

  private write(level: string, msg: string): void {
    const line = `${new Date().toISOString()} [${level}] ${msg}`;
    // eslint-disable-next-line no-console
    console.log(line);
    fs.appendFileSync(this.logFile, line + '\n');
  }

  info(msg: string): void {
    this.write('INFO', msg);
  }

  logSuccess(cce: CCE, rowCount: number): void {
    this.write('SUCCESS', `CCE ${cce.id}: ${rowCount} linha(s), relatório individual gerado.`);
  }

  logFailure(cce: CCE, err: unknown): void {
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    this.write('FAILURE', `CCE ${cce.id}: ${message}`);
  }

  get path(): string {
    return this.logFile;
  }
}
