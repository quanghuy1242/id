import { readFileSync } from "node:fs";

type RawStatement = {
  readonly all: (...bindings: unknown[]) => unknown[];
  readonly get: (...bindings: unknown[]) => unknown;
  readonly run: (...bindings: unknown[]) => { readonly changes: number; readonly lastInsertRowid: number | bigint };
};

export type RawSqlite = {
  readonly exec: (sql: string) => void;
  readonly prepare: (sql: string) => RawStatement;
};

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
    const row = this.sqlite.prepare(this.sql).get(...this.bindings) as Record<string, T> | undefined;
    if (!row) {
      return null;
    }

    return colName ? row[colName] ?? null : (row as T);
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
    return {
      success: true,
      results: this.sqlite.prepare(this.sql).all(...this.bindings) as T[],
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: 0,
        changed_db: false,
        changes: 0,
      },
    };
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    return this.sqlite.prepare(this.sql).all(...this.bindings) as T[];
  }
}

export async function createMemoryD1(): Promise<{ readonly db: D1Database; readonly raw: RawSqlite }> {
  const sqliteModuleName = "better-sqlite3";
  const { default: Database } = (await import(sqliteModuleName)) as {
    readonly default: new (path: string) => RawSqlite;
  };
  const raw = new Database(":memory:");
  raw.exec(readFileSync("migrations/0000_brown_puppet_master.sql", "utf8"));

  const db: D1Database = {
    prepare(query) {
      return new TestD1PreparedStatement(raw, query);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
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
