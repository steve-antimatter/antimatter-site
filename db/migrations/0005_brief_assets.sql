-- Assets made in the shops: one per output ticked in an approved brief.
-- stage: ordered -> in_progress (with Antimatter) -> review (link delivered) -> approved
CREATE TABLE IF NOT EXISTS brief_assets (
  brief_id      TEXT NOT NULL REFERENCES campaign_briefs(id) ON DELETE CASCADE,
  output_id     TEXT NOT NULL,
  stage         TEXT NOT NULL DEFAULT 'ordered',
  link          TEXT,
  link_title    TEXT,
  delivered_by  TEXT,
  delivered_at  TEXT,
  approved_by   TEXT,
  approved_at   TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (brief_id, output_id)
);
CREATE TABLE IF NOT EXISTS asset_events (
  brief_id    TEXT NOT NULL,
  output_id   TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  content     TEXT,
  author      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (brief_id, output_id, seq)
);
