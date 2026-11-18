-- 18.11: server render errors (digest + message) so a failing tab can be diagnosed without dashboard access.
CREATE TABLE IF NOT EXISTS app_errors (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), digest TEXT, path TEXT, route TEXT, kind TEXT, message TEXT, stack TEXT);
CREATE INDEX IF NOT EXISTS app_errors_at ON app_errors(at);
