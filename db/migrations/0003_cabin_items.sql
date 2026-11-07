-- Cabins below deck: links (and later files) the team keeps for Claude to read.
CREATE TABLE IF NOT EXISTS cabin_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cabin       TEXT NOT NULL,             -- radio | brand | product | proof | partners | competitors | content
  kind        TEXT NOT NULL DEFAULT 'link',
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  note        TEXT,
  added_by    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS cabin_items_cabin ON cabin_items(cabin);
