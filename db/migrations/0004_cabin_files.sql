-- Uploaded files in the cabins: the bytes live in R2 (binding CABIN_FILES); this links them to cabin_items.
CREATE TABLE IF NOT EXISTS cabin_files (
  item_id  INTEGER PRIMARY KEY REFERENCES cabin_items(id) ON DELETE CASCADE,
  r2_key   TEXT NOT NULL,
  mime     TEXT,
  size     INTEGER
);
