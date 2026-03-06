CREATE TABLE IF NOT EXISTS alert_events (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  request_id TEXT,
  dedupe_key TEXT UNIQUE,
  detail_json TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_occurred_at INTEGER NOT NULL DEFAULT (unixepoch()),
  acknowledged_at INTEGER,
  acknowledged_by_admin_id TEXT,
  FOREIGN KEY (acknowledged_by_admin_id) REFERENCES admin_users(id),
  CHECK (severity IN ('warning', 'error')),
  CHECK (status IN ('open', 'acknowledged')),
  CHECK (occurrence_count > 0)
);

CREATE INDEX IF NOT EXISTS idx_alert_events_status_severity_updated
ON alert_events(status, severity, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_events_category_updated
ON alert_events(category, updated_at DESC);
