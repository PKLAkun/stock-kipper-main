// Klien Supabase tiruan di memori untuk tes repository (tanpa jaringan).
// Mendukung: select (count/head), eq, neq, order, limit, maybeSingle, single, insert, update, delete, upsert.

export function createFakeSupabase(tables = {}) {
  const db = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const calls = [];
  let seq = 1000;

  function from(name) {
    db[name] ||= [];
    const q = { op: 'select', filters: [], opts: {}, patch: null, single: null, key: 'id' };
    const b = {
      select(_cols, opts = {}) { if (q.op === 'select') q.opts = opts; q.returning = true; return b; },
      eq(c, v) { q.filters.push((r) => r[c] === v); return b; },
      neq(c, v) { q.filters.push((r) => r[c] !== v); return b; },
      order() { return b; },
      limit() { return b; },
      or() { return b; },
      maybeSingle() { q.single = 'maybe'; return b; },
      single() { q.single = 'one'; return b; },
      insert(row) { q.op = 'insert'; q.patch = row; return b; },
      upsert(row) { q.op = 'upsert'; q.patch = row; return b; },
      update(patch) { q.op = 'update'; q.patch = patch; return b; },
      delete() { q.op = 'delete'; return b; },
      then(resolve, reject) { return Promise.resolve(exec()).then(resolve, reject); },
    };
    function exec() {
      calls.push({ table: name, op: q.op, patch: q.patch });
      const match = () => db[name].filter((r) => q.filters.every((f) => f(r)));
      let rows;
      if (q.op === 'insert') {
        const row = { id: ++seq, ...q.patch };
        db[name].push(row);
        rows = [row];
      } else if (q.op === 'upsert') {
        const k = q.patch.key ?? q.patch.kode ?? q.patch.id;
        const ada = db[name].find((r) => (r.key ?? r.kode ?? r.id) === k);
        if (ada) Object.assign(ada, q.patch); else db[name].push({ ...q.patch });
        rows = [q.patch];
      } else if (q.op === 'update') {
        rows = match();
        rows.forEach((r) => Object.assign(r, q.patch));
      } else if (q.op === 'delete') {
        rows = match();
        db[name] = db[name].filter((r) => !rows.includes(r));
      } else {
        rows = match();
      }
      if (q.opts.head) return { data: null, error: null, count: rows.length };
      if (q.single === 'maybe') return { data: rows[0] ? { ...rows[0] } : null, error: null };
      if (q.single === 'one') return rows[0] ? { data: { ...rows[0] }, error: null } : { data: null, error: { message: 'tidak ada baris' } };
      return { data: rows.map((r) => ({ ...r })), error: null, count: rows.length };
    }
    return b;
  }

  return { from, db, calls };
}
