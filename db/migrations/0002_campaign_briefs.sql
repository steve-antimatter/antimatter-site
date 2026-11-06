-- Campaign briefs (Town Hall). A brief belongs to an approved use case and is stored
-- as one JSON document whose shape is defined by src/brief/spec.js.
CREATE TABLE IF NOT EXISTS campaign_briefs (
  id                TEXT PRIMARY KEY,
  use_case_id       TEXT NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
  use_case_version  INTEGER,                 -- approved use case version it was started from
  title             TEXT NOT NULL,
  author            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft',  -- draft | review | locked
  doc               TEXT NOT NULL,           -- JSON: { core, groups, outputs, comms }
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS campaign_briefs_use_case ON campaign_briefs(use_case_id);

CREATE TABLE IF NOT EXISTS campaign_brief_versions (
  brief_id   TEXT NOT NULL REFERENCES campaign_briefs(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  snapshot   TEXT NOT NULL,
  locked_by  TEXT NOT NULL,
  locked_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (brief_id, version)
);

CREATE TABLE IF NOT EXISTS brief_chat (
  brief_id    TEXT NOT NULL REFERENCES campaign_briefs(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  role        TEXT NOT NULL,                 -- 'user' | 'assistant' | 'event'
  content     TEXT NOT NULL,
  author      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (brief_id, seq)
);
