// Runs SQL for the SQL exercises, away from the page so a runaway query can be stopped.
// Each message brings its own setup script, so every run starts with a fresh in-memory database.
importScripts('sql-wasm.js');

let sqlReady = null;
function getSql() {
  sqlReady = sqlReady || initSqlJs({ locateFile: (file) => file });
  return sqlReady;
}

function show(v) {
  if (v === null || v === undefined) return 'NULL';
  if (v instanceof Uint8Array) return '[' + v.length + ' bytes]';
  return String(v);
}

function table(result) {
  if (!result) return { columns: [], rows: [] };
  return { columns: result.columns, rows: result.values.map((row) => row.map(show)) };
}

// Runs a script and returns the table of its last statement that returns rows.
function runScript(db, text) {
  let last = null;
  for (const r of db.exec(text)) last = r;
  return table(last);
}

self.onmessage = async (event) => {
  const { id, setup, query, reference } = event.data;
  try {
    const SQL = await getSql();
    const db = new SQL.Database();
    try {
      db.exec(setup || '');
      const out = { id };
      if (query !== undefined) {
        try {
          out.result = runScript(db, query);
        } catch (e) {
          out.error = String((e && e.message) || e);
        }
      }
      if (reference !== undefined) out.expected = runScript(db, reference);
      if (event.data.schema) {
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid");
        out.schema = (tables[0] ? tables[0].values : []).map(([name]) => {
          const cols = db.exec('PRAGMA table_info("' + String(name).replace(/"/g, '""') + '")');
          const count = db.exec('SELECT COUNT(*) FROM "' + String(name).replace(/"/g, '""') + '"');
          return {
            name,
            rows: count[0] ? count[0].values[0][0] : 0,
            columns: (cols[0] ? cols[0].values : []).map((c) => ({ name: c[1], type: c[2], pk: c[5] > 0 }))
          };
        });
      }
      self.postMessage(out);
    } finally {
      db.close();
    }
  } catch (e) {
    self.postMessage({ id, fatal: String((e && e.message) || e) });
  }
};
