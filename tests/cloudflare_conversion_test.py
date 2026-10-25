import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('converter', Path(__file__).parents[1] / 'scripts/cloudflare/convert-d1.py')
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


def column(name, kind='text', default=None):
    return {'name': name, 'type': kind, 'default': default, 'nullable': True}


def table(name, columns, extra=None):
    return {'name': name, 'columns': columns, 'indexes': [], 'constraints': [
        {'name': name + '_pkey', 'type': 'p', 'definition': 'PRIMARY KEY (id)'}, *(extra or [])]}


def snapshot(root, orphan=False, payload='{"integer":9007199254740993}'):
    root.mkdir()
    tables = [
        table('automation_runs', [column('id'), column('lease_owner'), column('lease_until')]),
        table('ticket_generation_jobs', [column('id'), column('lease_owner'), column('lease_expires_at')]),
        table('users', [column('id', 'uuid', 'gen_random_uuid()'), column('name'), column('payload', 'jsonb'), column('flag', 'bool'), column('created_at', 'timestamptz'), column('large_id', 'int8')]),
        table('visits', [column('id'), column('user_id')], [{'name': 'visit_user', 'type': 'f', 'definition': 'FOREIGN KEY (user_id) REFERENCES users(id)'}]),
    ]
    rows = [[['automation', 'old-render', '2026-10-25T00:00:00Z']], [['job', 'old-render', '2026-10-25T00:00:00Z']],
            [['u1', "O'Brien\x00; DROP TABLE users; Ștucan", payload, 't', '2026-10-25 18:45:30.123456+03', '9007199254740993']], [['visit', 'missing' if orphan else 'u1']]]
    catalog = json.dumps({'format': 1, 'tables': tables}).encode()
    (root / 'catalog.json').write_bytes(catalog)
    manifest = {'format': 1, 'complete': True, 'catalogSha256': hashlib.sha256(catalog).hexdigest(), 'tables': []}
    for i, (meta, data) in enumerate(zip(tables, rows)):
        raw = ''.join(json.dumps(row) + '\n' for row in data).encode()
        name = str(i) + '.jsonl'
        (root / name).write_bytes(raw)
        manifest['tables'].append({'name': meta['name'], 'file': name, 'rows': len(data), 'sha256': hashlib.sha256(raw).hexdigest()})
    (root / 'manifest.json').write_text(json.dumps(manifest))


class ConversionTests(unittest.TestCase):
    def test_exact_data_utc_bigint_json_and_lease_reset(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'source', Path(temp) / 'target'
            snapshot(source)
            report = converter.convert(source, output)
            self.assertTrue(report['allRowsCompared'])
            self.assertFalse(report['applicationD1Ready'])
            db = sqlite3.connect(output / 'database.sqlite')
            row = db.execute('SELECT name,payload,flag,created_at,large_id FROM users').fetchone()
            self.assertEqual(row, ("O'Brien\x00; DROP TABLE users; Ștucan", '{"integer":9007199254740993}', 1, '2026-10-25T15:45:30.123456Z', 9007199254740993))
            self.assertEqual(db.execute('SELECT lease_owner,lease_expires_at FROM ticket_generation_jobs').fetchone(), (None, None))
            # The SQL dump must reproduce the same data, including NULs and quotes.
            copy = sqlite3.connect(':memory:')
            copy.executescript((output / 'import.sql').read_text())
            self.assertEqual(copy.execute('SELECT name FROM users').fetchone()[0], row[0])
            copy.close()
            data_copy=sqlite3.connect(':memory:')
            data_copy.executescript((output / 'schema.sql').read_text())
            data_copy.executescript((output / 'data-only.sql').read_text())
            self.assertEqual(data_copy.execute('SELECT name FROM users').fetchone()[0],row[0])
            with self.assertRaises(sqlite3.IntegrityError):
                data_copy.executescript((output / 'data-only.sql').read_text())
            self.assertEqual(report['dataImportSha256'],hashlib.sha256((output/'data-only.sql').read_bytes()).hexdigest())
            data_copy.close()
            db.close()

    def test_postgresql18_named_not_null_is_enforced(self):
        col = column('id')
        col['nullable'] = False
        position = column('position', 'int4')
        position['nullable'] = False
        meta = table('pg18', [col,position], [{'name': 'pg18_id_not_null', 'type': 'n', 'definition': 'NOT NULL id'}, {'name': 'pg18_position_not_null', 'type': 'n', 'definition': 'NOT NULL "position"'}])
        db = sqlite3.connect(':memory:')
        db.executescript(converter.schema_sql({'tables': [meta]}))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute('INSERT INTO pg18(id,position) VALUES(NULL,1)')
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO pg18(id,position) VALUES('valid',NULL)")
        db.close()

    def test_rejects_inconsistent_postgresql18_not_null_metadata(self):
        meta = table('pg18', [column('id')], [{'name': 'pg18_id_not_null', 'type': 'n', 'definition': 'NOT NULL id'}])
        with self.assertRaisesRegex(ValueError, 'Inconsistent PostgreSQL NOT NULL'):
            converter.schema_sql({'tables': [meta]})

    def test_rejects_corruption_before_creating_target(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'source', Path(temp) / 'target'
            snapshot(source)
            (source / '0.jsonl').write_text('[]\n')
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                converter.convert(source, output)
            self.assertFalse(output.exists())

    def test_rejects_orphans(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'source', Path(temp) / 'target'
            snapshot(source, orphan=True)
            with self.assertRaisesRegex(ValueError, 'Foreign key violations'):
                converter.convert(source, output)
            self.assertFalse((output / 'verification.json').exists())

    def test_splits_large_d1_statements_without_truncation(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'source', Path(temp) / 'target'
            payload = json.dumps({'large': "Ștucan's \u0000 🏆" * 10_000}, ensure_ascii=False)
            snapshot(source, payload=payload)
            result = converter.convert(source, output)
            self.assertEqual(result['oversizedRowsSplit'], 1)
            statements, split = converter.bounded_row_sql('INSERT INTO example VALUES (', [payload], 1)
            self.assertTrue(split)
            self.assertTrue(all(len(sql.encode()) <= converter.SQL_LIMIT for sql in statements))
            db = sqlite3.connect(':memory:')
            db.executescript((output/'import.sql').read_text())
            self.assertEqual(db.execute('SELECT payload FROM users').fetchone()[0], payload)
            self.assertIsNone(db.execute("SELECT name FROM sqlite_master WHERE name='_p11_import_parts'").fetchone())
            db.close()

    def test_rejects_rows_above_d1_limit_without_truncation(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'source', Path(temp) / 'target'
            snapshot(source, payload=json.dumps({'large': 'x' * 2_000_001}))
            with self.assertRaisesRegex(ValueError, 'D1 import row limit'):
                converter.convert(source, output)
            self.assertFalse((output / 'verification.json').exists())

    def test_rejects_incomplete_export(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'source', Path(temp) / 'target'
            snapshot(source)
            manifest = json.loads((source / 'manifest.json').read_text())
            manifest['complete'] = False
            (source / 'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'Incomplete'):
                converter.convert(source, output)

    def test_rejects_unknown_postgres_types_and_operators(self):
        with self.assertRaisesRegex(ValueError, 'Unsupported type'):
            converter.schema_sql({'tables': [table('unsupported', [column('id', '_text')])]})
        with self.assertRaisesRegex(ValueError, 'Unsupported PostgreSQL'):
            converter.pg_expression("data::jsonb ->> 'key'")

    def test_slot_check_matches_custom_review_range(self):
        expr = converter.pg_expression("slot = ANY (ARRAY['FIVE_A'::text, 'TWO_B'::text]) OR slot ~ '^(CUSTOM|REVIEW)_[0-9]{1,3}$'::text")
        db = sqlite3.connect(':memory:')
        db.execute('CREATE TABLE slots(slot TEXT CHECK(' + expr + '))')
        for value in ['FIVE_A', 'TWO_B', 'CUSTOM_1', 'REVIEW_999', 'CUSTOM_001']:
            db.execute('INSERT INTO slots VALUES (?)', [value])
        for value in ['CUSTOM_', 'CUSTOM_1000', 'CUSTOM_1x', 'REVIEW_-1', 'REVIEW_١', 'X_CUSTOM_1']:
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('INSERT INTO slots VALUES (?)', [value])
        db.close()

    def test_uuid_defaults_are_version_four(self):
        db = sqlite3.connect(':memory:')
        db.execute('CREATE TABLE uuids(id TEXT' + converter.default_sql('gen_random_uuid()') + ')')
        db.execute('INSERT INTO uuids DEFAULT VALUES')
        self.assertRegex(db.execute('SELECT id FROM uuids').fetchone()[0], r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
        db.close()


if __name__ == '__main__':
    unittest.main()
