import { readFileSync, readdirSync } from "node:fs";
import type Database from "better-sqlite3";

export type RawSqlite = Database.Database;

export function applyAuthMigrations(raw: RawSqlite): void {
  const migrations = readdirSync("migrations")
    .filter((file) => /^\d+_.*\.sql$/u.test(file))
    .sort();
  for (const migration of migrations) {
    raw.exec(readFileSync(`migrations/${migration}`, "utf8"));
  }
}

class TestD1PreparedStatement implements D1PreparedStatement {
  private readonly bindings: readonly unknown[];

  constructor(
    private readonly sqlite: RawSqlite,
    private readonly sql: string,
    bindings: readonly unknown[] = [],
  ) {
    this.bindings = bindings;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new TestD1PreparedStatement(this.sqlite, this.sql, values);
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const row = this.sqlite.prepare(this.sql).get(...this.bindings) as
      | Record<string, T>
      | undefined;
    if (!row) {
      return null;
    }

    return colName ? (row[colName] ?? null) : (row as T);
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    const result = this.sqlite.prepare(this.sql).run(...this.bindings);
    return {
      success: true,
      results: [] as T[],
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: result.changes,
        last_row_id: Number(result.lastInsertRowid),
        changed_db: result.changes > 0,
        changes: result.changes,
      },
    };
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const statement = this.sqlite.prepare(this.sql);
    try {
      return {
        success: true,
        results: statement.all(...this.bindings) as T[],
        meta: {
          duration: 0,
          size_after: 0,
          rows_read: 0,
          rows_written: 0,
          last_row_id: 0,
          changed_db: false,
          changes: 0,
        },
      };
    } catch (error) {
      if (
        !(error instanceof TypeError) ||
        !error.message.includes("does not return data")
      ) {
        throw error;
      }
    }
    const result = statement.run(...this.bindings);
    return {
      success: true,
      results: [] as T[],
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: result.changes,
        last_row_id: Number(result.lastInsertRowid),
        changed_db: result.changes > 0,
        changes: result.changes,
      },
    };
  }

  raw<T = unknown[]>(options: {
    columnNames: true;
  }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(options?: {
    columnNames?: boolean;
  }): Promise<T[] | [string[], ...T[]]> {
    const statement = this.sqlite.prepare(this.sql);
    if (options?.columnNames) {
      const columnNames = statement.columns().map((column) => column.name);
      const rows = statement.raw(true).all(...this.bindings) as T[];
      return [columnNames, ...rows];
    }
    return statement.raw(true).all(...this.bindings) as T[];
  }
}

export async function createMemoryD1(): Promise<{
  readonly db: D1Database;
  readonly raw: RawSqlite;
}> {
  const sqliteModuleName = "better-sqlite3";
  const { default: Database } = (await import(sqliteModuleName)) as {
    readonly default: new (path: string) => RawSqlite;
  };
  const raw = new Database(":memory:");
  applyAuthMigrations(raw);

  const db: D1Database = {
    prepare(query) {
      return new TestD1PreparedStatement(raw, query);
    },
    async batch<T = unknown>(
      statements: D1PreparedStatement[],
    ): Promise<D1Result<T>[]> {
      return Promise.all(statements.map((statement) => statement.run<T>()));
    },
    async exec(query): Promise<D1ExecResult> {
      raw.exec(query);
      return { count: 0, duration: 0 };
    },
    withSession() {
      return this as unknown as D1DatabaseSession;
    },
    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    },
  };

  return { db, raw };
}
