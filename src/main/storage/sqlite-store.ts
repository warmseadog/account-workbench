import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SqliteValue = string | number | null;
export type SqliteParams = Record<string, SqliteValue>;
export type SqliteRow = Record<string, unknown>;

export class SqliteStore {
  readonly db: DatabaseSync;

  constructor(readonly filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.initializeSchema();
  }

  run(sql: string, params: SqliteParams = {}): void {
    this.db.prepare(sql).run(params);
  }

  get<T extends SqliteRow>(sql: string, params: SqliteParams = {}): T | undefined {
    return this.db.prepare(sql).get(params) as T | undefined;
  }

  all<T extends SqliteRow>(sql: string, params: SqliteParams = {}): T[] {
    return this.db.prepare(sql).all(params) as T[];
  }

  close(): void {
    this.db.close();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS platforms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        login_url TEXT NOT NULL,
        allowed_origins TEXT NOT NULL,
        home_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS login_adapters (
        id TEXT PRIMARY KEY,
        platform_id TEXT NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
        auth_mode TEXT NOT NULL DEFAULT 'password',
        username_locator TEXT NOT NULL,
        password_locator TEXT NOT NULL,
        submit_locator TEXT NOT NULL,
        start_locator TEXT,
        flow_steps TEXT NOT NULL DEFAULT '[]',
        success_rules TEXT NOT NULL,
        failure_rules TEXT NOT NULL,
        manual_rules TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        platform_id TEXT NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
        display_name TEXT NOT NULL,
        username_enc TEXT NOT NULL,
        password_enc TEXT NOT NULL,
        tags TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        status TEXT NOT NULL,
        last_login_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        message TEXT NOT NULL,
        redacted_meta TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.ensureColumn("login_adapters", "auth_mode", "TEXT NOT NULL DEFAULT 'password'");
    this.ensureColumn("login_adapters", "start_locator", "TEXT");
    this.ensureColumn("login_adapters", "flow_steps", "TEXT NOT NULL DEFAULT '[]'");
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.all<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!columns.some((row) => row.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    }
  }
}
