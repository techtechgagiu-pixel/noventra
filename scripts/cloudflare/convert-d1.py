"""Offline conversion and integrity checks. Never contacts PostgreSQL or Cloudflare.

Input: private export-postgres.mjs snapshot. Output must be a NEW private directory.
Unsupported schema expressions/types fail closed; no best-effort silent conversion.
"""
import hashlib
import json
import os
import re
import sqlite3
import sys
from pathlib import Path

SQL_LIMIT = 100_000
ROW_LIMIT = 2_000_000
FREE_DB_LIMIT = 500 * 1024 * 1024
TYPES = {'text': 'TEXT', 'uuid': 'TEXT', 'timestamptz': 'TEXT', 'date': 'TEXT',
         'int4': 'INTEGER', 'int8': 'INTEGER', 'bool': 'INTEGER', 'numeric': 'NUMERIC', 'jsonb': 'TEXT'}


def qi(value):
    return '"' + value.replace('"', '""') + '"'


def pg_expression(value):
    value = re.sub(r'::(?:text|jsonb|boolean|numeric|integer|bigint)\b', '', value)
    value = re.sub(r'([a-z_]+) = ANY \(ARRAY\[([^\]]+)\]\)', r'\1 IN (\2)', value)
    value = value.replace("slot ~ '^(CUSTOM|REVIEW)_[0-9]{1,3}$'", "((substr(slot,1,7)='CUSTOM_' OR substr(slot,1,7)='REVIEW_') AND length(substr(slot,8)) BETWEEN 1 AND 3 AND substr(slot,8) NOT GLOB '*[^0-9]*')")
    if any(token in value for token in ('::', '->', ' ~ ', 'ANY ', 'ARRAY[', 'public.', 'nextval(', 'now()')):
        raise ValueError('Unsupported PostgreSQL expression: ' + value)
    return value


def default_sql(value):
    if value is None:
        return ''
    if value.startswith('nextval('):
        return ''  # Converted INTEGER PRIMARY KEY uses SQLite rowid allocation.
    if value == 'gen_random_uuid()':
        return " DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(random()&3),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))))"
    if value == 'now()':
        return " DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
    value = pg_expression(value)
    if value in ('true', 'false'):
        value = '1' if value == 'true' else '0'
    if not re.fullmatch(r"'(?:[^']|'')*'|[-+]?\d+(?:\.\d+)?|[01]", value):
        raise ValueError('Unsupported default: ' + value)
    return ' DEFAULT ' + value


def schema_sql(catalog):
    statements = []
    for table in catalog['tables']:
        definitions = []
        serials = [c['name'] for c in table['columns'] if (c['default'] or '').startswith('nextval(')]
        for col in table['columns']:
            name, kind = col['name'], col['type']
            if kind not in TYPES:
                raise ValueError('Unsupported type: ' + kind)
            definition = qi(name) + ' ' + TYPES[kind]
            if name in serials:
                if not any(c['type'] == 'p' and c['definition'] == 'PRIMARY KEY (' + name + ')' for c in table['constraints']):
                    raise ValueError('Serial must be a single-column primary key')
                definition += ' PRIMARY KEY AUTOINCREMENT'
            if not col['nullable']:
                definition += ' NOT NULL'
            definition += default_sql(col['default'])
            if kind == 'bool':
                definition += ' CHECK (' + qi(name) + ' IN (0,1))'
            if kind == 'jsonb':
                definition += ' CHECK (' + qi(name) + ' IS NULL OR json_valid(' + qi(name) + '))'
            definitions.append(definition)
        for constraint in table['constraints']:
            if constraint['type'] == 'n':
                # PostgreSQL18 also records NOT NULL in pg_constraint. The
                # column definition already enforces it; require exact agreement.
                column = next((c for c in table['columns'] if constraint['definition'] in ('NOT NULL ' + c['name'], 'NOT NULL ' + qi(c['name']))), None)
                if column is None or column['nullable']:
                    raise ValueError('Inconsistent PostgreSQL NOT NULL constraint')
                continue
            if constraint['type'] == 'p' and serials:
                continue
            if constraint['type'] not in ('p', 'u', 'c', 'f'):
                raise ValueError('Unsupported constraint type: ' + constraint['type'])
            definitions.append('CONSTRAINT ' + qi(constraint['name']) + ' ' + pg_expression(constraint['definition']))
        statements.append('CREATE TABLE ' + qi(table['name']) + ' (\n  ' + ',\n  '.join(definitions) + '\n);')
        for index in table['indexes']:
            value = index['definition'].replace(' ON public.', ' ON ').replace(' USING btree ', ' ')
            statements.append(pg_expression(value) + ';')
    if any(len(s.encode()) > SQL_LIMIT for s in statements):
        raise ValueError('Schema statement exceeds D1 SQL limit')
    return '\n\n'.join(statements) + '\n'


def cell(value, col):
    if value is None:
        return None
    kind = col['type']
    if kind == 'bool':
        if value not in ('t', 'f'):
            raise ValueError('Invalid PostgreSQL boolean')
        return 1 if value == 't' else 0
    if kind in ('int4', 'int8'):
        return int(value)
    if kind == 'timestamptz':
        # ISO UTC text with six fractional digits, matching PostgreSQL precision.
        from datetime import datetime, timezone
        return datetime.fromisoformat(value.replace(' ', 'T')).astimezone(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')
    if kind == 'jsonb':
        json.loads(value)  # Validate; retain raw text to avoid numeric precision loss.
    return value


def literal(value):
    if value is None:
        return 'NULL'
    if isinstance(value, int):
        return str(value)
    if '\x00' in value:
        return "CAST(X'" + value.encode().hex() + "' AS TEXT)"
    return "'" + value.replace("'", "''") + "'"


IMPORT_PARTS_TABLE = '_p11_import_parts'
IMPORT_PARTS_SCHEMA = 'CREATE TABLE "_p11_import_parts"(record INTEGER NOT NULL,column_no INTEGER NOT NULL,part_no INTEGER NOT NULL,chunk TEXT NOT NULL,PRIMARY KEY(record,column_no,part_no));\n'


def bounded_row_sql(prefix, values, record):
    statement = prefix + ','.join(literal(v) for v in values) + ');\n'
    if len(statement.encode()) <= SQL_LIMIT:
        return [statement], False
    statements, expressions = [], []
    for column_no, value in enumerate(values):
        if not isinstance(value, str):
            expressions.append(literal(value))
            continue
        raw, offset, part = value.encode(), 0, 0
        while offset < len(raw) or part == 0:
            end = min(offset + 32_000, len(raw))
            while end < len(raw) and raw[end] & 0xc0 == 0x80:
                end -= 1
            chunk = raw[offset:end]
            statements.append('INSERT INTO "_p11_import_parts" VALUES (' + str(record) + ',' + str(column_no) + ',' + str(part) + ",CAST(X'" + chunk.hex() + "' AS TEXT));\n")
            offset, part = end, part + 1
        expressions.append('(SELECT group_concat(chunk,\'\') FROM (SELECT chunk FROM "_p11_import_parts" WHERE record=' + str(record) + ' AND column_no=' + str(column_no) + ' ORDER BY part_no))')
    statements.append(prefix + ','.join(expressions) + ');\n')
    statements.append('DELETE FROM "_p11_import_parts" WHERE record=' + str(record) + ';\n')
    if any(len(sql.encode()) > SQL_LIMIT for sql in statements):
        raise ValueError('D1 import statement still exceeds limit')
    return statements, True


def read_checked(root, entry):
    target = (root / entry['file']).resolve()
    if target.parent != root.resolve():
        raise ValueError('Snapshot path escapes its directory')
    data_hash = hashlib.sha256()
    with target.open('rb') as source:
        for line in source:
            data_hash.update(line)
    if data_hash.hexdigest() != entry['sha256']:
        raise ValueError('Snapshot hash mismatch: ' + entry['name'])
    return target


def lines(file):
    with file.open(encoding='utf8') as source:
        yield from source


def import_order(tables):
    """D1 may commit import chunks separately, so parents must precede children."""
    pending = {table['name']: table for table in tables}
    ordered, done = [], set()
    while pending:
        ready = []
        for name, table in pending.items():
            parents = set()
            for constraint in table['constraints']:
                if constraint['type'] == 'f':
                    match = re.search(r'REFERENCES (?:"([^"]+)"|([a-z_]+))\(', constraint['definition'])
                    if not match:
                        raise ValueError('Unsupported foreign key dependency')
                    parents.add(match.group(1) or match.group(2))
            if parents <= done:
                ready.append(name)
        if not ready:
            raise ValueError('Cyclic or missing foreign key dependency')
        for name in ready:
            ordered.append(name)
            done.add(name)
            del pending[name]
    return ordered


def convert(source, output):
    source, output = Path(source), Path(output)
    manifest = json.loads((source / 'manifest.json').read_text())
    catalog_bytes = (source / 'catalog.json').read_bytes()
    if manifest.get('format') != 1 or manifest.get('complete') is not True or hashlib.sha256(catalog_bytes).hexdigest() != manifest['catalogSha256']:
        raise ValueError('Incomplete/unsupported/corrupt snapshot')
    catalog = json.loads(catalog_bytes)
    if [t['name'] for t in catalog['tables']] != [t['name'] for t in manifest['tables']]:
        raise ValueError('Table inventory mismatch')
    checked = [read_checked(source, entry) for entry in manifest['tables']]
    if any(t['name'] == IMPORT_PARTS_TABLE for t in catalog['tables']):
        raise ValueError('Snapshot contains reserved import table')
    sql = schema_sql(catalog)
    output.mkdir(mode=0o700)
    db_path = output / 'database.sqlite'
    connection = sqlite3.connect(db_path)
    os.chmod(db_path, 0o600)
    imported = []
    parts_used, split_rows, record = False, 0, 0
    try:
        connection.executescript(sql)
        (output / 'schema.sql').write_text(sql)
        # Keep deferred checks for local conversion, but emit parents first because
        # remote D1 import chunks may commit independently. Explicitly verify FKs
        # before marking any import ready.
        with (output / 'import.sql').open('w') as dump, (output / 'data-only.sql').open('w') as data_dump:
            os.chmod(output / 'import.sql', 0o600)
            os.chmod(output / 'data-only.sql', 0o600)
            data_dump.write('PRAGMA defer_foreign_keys=ON;\n')
            dump.write('PRAGMA defer_foreign_keys=ON;\n' + sql)
            entries = {table['name']: (table, entry, data) for table, entry, data in zip(catalog['tables'], manifest['tables'], checked)}
            for name in import_order(catalog['tables']):
                table, entry, data = entries[name]
                prefix = 'INSERT INTO ' + qi(table['name']) + ' (' + ','.join(qi(c['name']) for c in table['columns']) + ') VALUES ('
                placeholders = 'INSERT INTO ' + qi(table['name']) + ' VALUES (' + ','.join('?' for _ in table['columns']) + ')'
                count = 0
                max_row = 0
                for line in lines(data):
                    raw = json.loads(line)
                    if len(raw) != len(table['columns']):
                        raise ValueError('Column count mismatch')
                    values = [cell(v, c) for v, c in zip(raw, table['columns'])]
                    row_bytes = sum(len(str(v).encode()) for v in values if v is not None)
                    max_row = max(max_row, row_bytes)
                    if row_bytes > ROW_LIMIT:
                        raise ValueError('D1 import row limit exceeded in ' + table['name'])
                    statements, split = bounded_row_sql(prefix, values, record)
                    record += 1
                    if split and not parts_used:
                        dump.write(IMPORT_PARTS_SCHEMA)
                        data_dump.write(IMPORT_PARTS_SCHEMA)
                        parts_used = True
                    split_rows += int(split)
                    connection.execute(placeholders, values)
                    for statement in statements:
                        dump.write(statement)
                        data_dump.write(statement)
                    count += 1
                if count != entry['rows']:
                    raise ValueError('Row count mismatch: ' + table['name'])
                imported.append({'name': table['name'], 'rows': count, 'maxRowBytes': max_row})
            if parts_used:
                dump.write('DROP TABLE "_p11_import_parts";\n')
                data_dump.write('DROP TABLE "_p11_import_parts";\n')
            # Reset only transient leases, never jobs/history/budgets or user data.
            resets = ["UPDATE ticket_generation_jobs SET lease_owner=NULL,lease_expires_at=NULL;",
                      "UPDATE automation_runs SET lease_owner=NULL,lease_until=NULL;"]
            for reset in resets:
                connection.execute(reset)
                dump.write(reset + '\n')
                data_dump.write(reset + '\n')
        violations = connection.execute('PRAGMA foreign_key_check').fetchall()
        if violations:
            raise ValueError('Foreign key violations: ' + str(len(violations)))
        if connection.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('SQLite integrity check failed')
        # Re-read every imported row by its primary key; counts alone cannot detect
        # wrong outcomes/odds, altered JSON, UUIDs, or timestamp conversions.
        for table, data in zip(catalog['tables'], checked):
            pk = next(c for c in table['constraints'] if c['type'] == 'p')
            keys = re.fullmatch(r'PRIMARY KEY \(([^)]+)\)', pk['definition']).group(1).split(', ')
            key_positions = [next(i for i, c in enumerate(table['columns']) if c['name'] == k) for k in keys]
            lookup = 'SELECT ' + ','.join(qi(c['name']) for c in table['columns']) + ' FROM ' + qi(table['name']) + ' WHERE ' + ' AND '.join(qi(k) + '=?' for k in keys)
            for line in lines(data):
                values = [cell(v, c) for v, c in zip(json.loads(line), table['columns'])]
                actual = connection.execute(lookup, [values[i] for i in key_positions]).fetchone()
                if actual is None:
                    raise ValueError('Missing imported primary key: ' + table['name'])
                for col, expected, observed in zip(table['columns'], values, actual):
                    if col['name'] in ('lease_owner', 'lease_expires_at', 'lease_until') and table['name'] in ('ticket_generation_jobs', 'automation_runs'):
                        expected = None
                    if col['type'] == 'numeric' and expected is not None:
                        expected = float(expected)
                    if expected != observed:
                        raise ValueError('Data parity failed: ' + table['name'] + '.' + col['name'])
        connection.commit()
        connection.execute('VACUUM')
        size = db_path.stat().st_size
        if size > FREE_DB_LIMIT:
            raise ValueError('Database exceeds D1 Free 500 MB limit')
        report = {'format': 1, 'status': 'converted-not-deployed', 'sourceCatalogSha256': manifest['catalogSha256'],
                  'tables': imported, 'sqliteBytes': size, 'foreignKeyViolations': 0,
                  'leasesReset': True, 'allRowsCompared': True, 'oversizedRowsSplit': split_rows, 'applicationD1Ready': False}
        report['schemaSha256'] = hashlib.sha256((output / 'schema.sql').read_bytes()).hexdigest()
        report['dataImportSha256'] = hashlib.sha256((output / 'data-only.sql').read_bytes()).hexdigest()
        report['importSha256'] = hashlib.sha256((output / 'import.sql').read_bytes()).hexdigest()
        (output / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
        return report
    finally:
        connection.close()


if __name__ == '__main__':
    os.umask(0o077)
    if len(sys.argv) != 3:
        sys.exit('Usage: python3 scripts/cloudflare/convert-d1.py SNAPSHOT NEW_OUTPUT_DIRECTORY')
    try:
        result = convert(sys.argv[1], sys.argv[2])
        print(json.dumps({'status': result['status'], 'tables': len(result['tables']), 'sqliteBytes': result['sqliteBytes']}))
    except Exception as error:
        sys.exit('Conversion blocked: ' + str(error))
