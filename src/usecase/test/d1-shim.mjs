// Minimal Cloudflare D1 stand-in over node:sqlite, for local tests only.
import { DatabaseSync } from 'node:sqlite';
export function d1(path = ':memory:') {
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys = ON');
  const make = (sql, params = []) => ({
    sql, params,
    bind: (...a) => make(sql, a),
    all: async () => ({ results: raw.prepare(sql).all(...params).map((r) => ({ ...r })) }),
    first: async () => { const r = raw.prepare(sql).get(...params); return r ? { ...r } : null; },
    run: async () => raw.prepare(sql).run(...params),
  });
  return {
    prepare: (sql) => make(sql),
    batch: async (stmts) => {
      raw.exec('BEGIN');
      try { for (const s of stmts) raw.prepare(s.sql).run(...s.params); raw.exec('COMMIT'); }
      catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
}
