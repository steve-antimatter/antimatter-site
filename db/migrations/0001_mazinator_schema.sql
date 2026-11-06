-- Mazinator database, schema v1 (Cloudflare D1 / SQLite).
--
-- Two layers:
--   1. Shared libraries ("cabins"): products, industries, personas, partners,
--      competitors, customers, quotes, sources. Written once, reused by every
--      use case, so a partner or a quote is never retyped and the map can
--      filter by what each use case links to.
--   2. Use cases ("islands"): one row per use case plus link tables that hold
--      the text specific to that use case (why a partner matters HERE, how we
--      beat a competitor HERE, what a persona cares about HERE).
--
-- Section order and wording follow the locked template:
-- Problem, Position, Industries, Personas, Pain points, Customers/quotes,
-- Partners, Competitors, Objections, Sources.

PRAGMA foreign_keys = ON;

-- ---------- Shared libraries ----------

CREATE TABLE products (
  id          TEXT PRIMARY KEY,          -- 'flow', 'play', 'go'
  name        TEXT NOT NULL,             -- 'Leapwork Flow'
  summary     TEXT,
  logo_asset  TEXT,                      -- asset path or URL of the logo
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE industries (
  id    TEXT PRIMARY KEY,                -- 'pharma'
  name  TEXT NOT NULL
);

CREATE TABLE personas (
  id          TEXT PRIMARY KEY,          -- 'qa-leader'
  name        TEXT NOT NULL,             -- 'QA leader'
  descriptor  TEXT                       -- 'Head of QA or test automation'
);

CREATE TABLE sources (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  url        TEXT NOT NULL UNIQUE,
  publisher  TEXT,
  checked_on TEXT                        -- ISO date the claim was last verified
);

CREATE TABLE partners (
  id         TEXT PRIMARY KEY,           -- 'microsoft'
  name       TEXT NOT NULL,
  program    TEXT NOT NULL,              -- the strategic program, same for every use case
  source_id  TEXT REFERENCES sources(id)
);

CREATE TABLE competitors (
  id         TEXT PRIMARY KEY,           -- 'tricentis'
  name       TEXT NOT NULL,
  products   TEXT,                       -- 'Tosca, qTest, Vera'
  url        TEXT
);

CREATE TABLE customers (
  id           TEXT PRIMARY KEY,         -- 'investec'
  name         TEXT NOT NULL,            -- real name, even when anonymous
  display_name TEXT NOT NULL,            -- what the page shows ('Multinational bank')
  anonymous    INTEGER NOT NULL DEFAULT 0,
  industry_id  TEXT REFERENCES industries(id),
  descriptor   TEXT                      -- 'Private bank', 'Dutch cell and gene therapy center'
);

CREATE TABLE quotes (
  id             TEXT PRIMARY KEY,
  customer_id    TEXT NOT NULL REFERENCES customers(id),
  text           TEXT NOT NULL,
  speaker_name   TEXT,                   -- NULL when only a title is public
  speaker_title  TEXT,
  source_id      TEXT REFERENCES sources(id),
  origin         TEXT NOT NULL DEFAULT 'published'  -- 'published' | 'call' (call recordings, later)
);

-- ---------- Use cases ----------

CREATE TABLE use_cases (
  id                 TEXT PRIMARY KEY,   -- 'governance-in-testing'
  title              TEXT NOT NULL,
  author             TEXT NOT NULL,
  created_on         TEXT NOT NULL,      -- ISO date shown in the header
  status             TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'review' | 'locked'
  problem            TEXT NOT NULL,
  position           TEXT NOT NULL,
  pain_points_note   TEXT,               -- e.g. the Enterprise Edition line
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE use_case_industries (
  use_case_id   TEXT NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
  industry_id   TEXT NOT NULL REFERENCES industries(id),
  sort          INTEGER NOT NULL,
  label         TEXT,                    -- override for this page ('Public companies')
  drives_need   TEXT NOT NULL,
  PRIMARY KEY (use_case_id, industry_id)
);

CREATE TABLE use_case_personas (
  use_case_id   TEXT NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
  persona_id    TEXT NOT NULL REFERENCES personas(id),
  sort          INTEGER NOT NULL,
  descriptor    TEXT,                    -- override for this page ('Pharma, med-device')
  role_in_deal  TEXT NOT NULL,
  cares_about   TEXT NOT NULL,
  PRIMARY KEY (use_case_id, persona_id)
);

CREATE TABLE pain_points (
  id            TEXT PRIMARY KEY,
  use_case_id   TEXT NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL REFERENCES products(id),
  sort          INTEGER NOT NULL,        -- order within the whole table
  title         TEXT NOT NULL,           -- bold lead-in
  detail        TEXT NOT NULL,
  fix           TEXT NOT NULL            -- 'How we fix it'
);
-- Template rule: at most three pain points per product per use case.
CREATE TRIGGER pain_points_max_three BEFORE INSERT ON pain_points
WHEN (SELECT COUNT(*) FROM pain_points
      WHERE use_case_id = NEW.use_case_id AND product_id = NEW.product_id) >= 3
BEGIN SELECT RAISE(ABORT, 'max three pain points per product'); END;

-- Who feels each pain point. Empty in v1; ready for brief targeting later.
CREATE TABLE pain_point_personas (
  pain_point_id TEXT NOT NULL REFERENCES pain_points(id) ON DELETE CASCADE,
  persona_id    TEXT NOT NULL REFERENCES personas(id),
  PRIMARY KEY (pain_point_id, persona_id)
);
CREATE TABLE pain_point_industries (
  pain_point_id TEXT NOT NULL REFERENCES pain_points(id) ON DELETE CASCADE,
  industry_id   TEXT NOT NULL REFERENCES industries(id),
  PRIMARY KEY (pain_point_id, industry_id)
);

CREATE TABLE use_case_customers (
  use_case_id    TEXT NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
  customer_id    TEXT NOT NULL REFERENCES customers(id),
  sort           INTEGER NOT NULL,
  quote_id       TEXT REFERENCES quotes(id),   -- NULL = no quote shown
  what_they_did  TEXT NOT NULL,
  source_id      TEXT NOT NULL REFERENCES sources(id),
  source_label   TEXT NOT NULL DEFAULT 'Case study',
  PRIMARY KEY (use_case_id, customer_id)
);

CREATE TABLE use_case_partners (
  use_case_id     TEXT NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
  partner_id      TEXT NOT NULL REFERENCES partners(id),
  sort            INTEGER NOT NULL,
  why_it_matters  TEXT NOT NULL,
  PRIMARY KEY (use_case_id, partner_id)
);

CREATE TABLE use_case_competitors (
  use_case_id    TEXT NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
  competitor_id  TEXT NOT NULL REFERENCES competitors(id),
  sort           INTEGER NOT NULL,
  their_pitch    TEXT NOT NULL,
  how_we_win     TEXT NOT NULL,
  url            TEXT,                   -- page linked for this use case (else competitors.url)
  PRIMARY KEY (use_case_id, competitor_id)
);

CREATE TABLE objections (
  id           TEXT PRIMARY KEY,
  use_case_id  TEXT NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
  sort         INTEGER NOT NULL,
  objection    TEXT NOT NULL,
  response     TEXT NOT NULL
);

CREATE TABLE use_case_sources (
  use_case_id  TEXT NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
  source_id    TEXT NOT NULL REFERENCES sources(id),
  grp          TEXT NOT NULL,            -- 'Leapwork', 'Customers', 'SOX', ...
  sort         INTEGER NOT NULL,
  PRIMARY KEY (use_case_id, source_id)
);

-- Locked snapshots: the exact record behind a published page/PDF.
CREATE TABLE use_case_versions (
  use_case_id  TEXT NOT NULL REFERENCES use_cases(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  snapshot     TEXT NOT NULL,            -- full use case as JSON
  locked_by    TEXT NOT NULL,
  locked_at    TEXT NOT NULL DEFAULT (datetime('now')),
  note         TEXT,
  PRIMARY KEY (use_case_id, version)
);

-- Map filters: every product, industry and partner a use case touches.
CREATE VIEW use_case_tags AS
  SELECT DISTINCT use_case_id, 'product'  AS kind, product_id  AS tag FROM pain_points
  UNION SELECT use_case_id, 'industry', industry_id FROM use_case_industries
  UNION SELECT use_case_id, 'partner',  partner_id  FROM use_case_partners;
