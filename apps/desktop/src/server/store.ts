// SPDX-License-Identifier: Apache-2.0
/** WebOS state in bun:sqlite: command history of the shell, REPL and terminal, and key/value settings. */
import { Database } from "bun:sqlite";

export interface HistoryRow {
  id: number;
  kind: "shell" | "eval" | "pty";
  input: string;
  exitCode: number | null;
  durationMs: number | null;
  at: string;
}

export class WebOSStore {
  readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true, strict: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run(`CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      input TEXT NOT NULL,
      exitCode INTEGER,
      durationMs REAL,
      at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`);
    this.db.run("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }

  record(kind: HistoryRow["kind"], input: string, exitCode: number | null, durationMs: number | null): void {
    this.db
      .query("INSERT INTO history (kind, input, exitCode, durationMs) VALUES ($kind, $input, $exitCode, $durationMs)")
      .run({ kind, input, exitCode, durationMs });
  }

  history(limit = 100, kind?: HistoryRow["kind"]): HistoryRow[] {
    return kind
      ? this.db
          .query<HistoryRow, any>("SELECT * FROM history WHERE kind = $kind ORDER BY id DESC LIMIT $limit")
          .all({ kind, limit })
      : this.db.query<HistoryRow, any>("SELECT * FROM history ORDER BY id DESC LIMIT $limit").all({ limit });
  }

  get(key: string): string | null {
    return (
      this.db.query<{ value: string }, any>("SELECT value FROM settings WHERE key = $key").get({ key })?.value ?? null
    );
  }

  set(key: string, value: string): void {
    this.db
      .query(
        "INSERT INTO settings (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run({ key, value });
  }

  close(): void {
    this.db.close();
  }
}
