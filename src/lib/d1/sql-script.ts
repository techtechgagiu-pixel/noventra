/** Split trusted migration scripts at SQL statement boundaries, keeping quoted
 * prompt text (including semicolons/newlines) and comments intact. */
export function splitSqlScript(sql: string): string[] {
  const statements: string[] = [];
  let start = 0, mode: 'code' | 'single' | 'double' | 'line' | 'block' = 'code';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i], next = sql[i + 1];
    if (mode === 'single' || mode === 'double') {
      if (ch === (mode === 'single' ? "'" : '"')) {
        if (next === ch) i++; else mode = 'code';
      }
    } else if (mode === 'line') { if (ch === '\n') mode = 'code'; }
    else if (mode === 'block') { if (ch === '*' && next === '/') { i++; mode = 'code'; } }
    else if (ch === "'") mode = 'single';
    else if (ch === '"') mode = 'double';
    else if (ch === '-' && next === '-') { i++; mode = 'line'; }
    else if (ch === '/' && next === '*') { i++; mode = 'block'; }
    else if (ch === ';') { const statement = sql.slice(start, i).trim(); if (statement) statements.push(statement); start = i + 1; }
  }
  if (mode !== 'code' && mode !== 'line') throw new Error('Unterminated SQL migration');
  const tail = sql.slice(start).trim(); if (tail) statements.push(tail);
  return statements;
}
