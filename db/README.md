# Mazinator database

Cloudflare D1 (SQLite). Not served publicly (`db` is in `.assetsignore`).

- `migrations/0001_mazinator_schema.sql`: tables. Shared libraries (products, industries, personas, partners, competitors, customers, quotes, sources) plus use cases and their link tables. Section order follows the locked use case template.
- `seed/governance-in-testing.json`: the first use case in its JSON form. This shape is the contract between the database, the authoring chat and the page/PDF renderer.
- `seed/governance-in-testing.sql`: the same, as INSERTs (generated).
- `tools/usecase.py`: `sql` (JSON to INSERTs), `load` (JSON into a local sqlite file), `export` (tables back to JSON).

Rules enforced in the schema: at most three pain points per product per use case; deleting a use case removes all its rows. The `use_case_tags` view lists every product, industry and partner a use case touches, for the map filters.

Applying to D1 (once the database exists):
    npx wrangler d1 migrations apply mazinator --remote
    npx wrangler d1 execute mazinator --remote --file db/seed/governance-in-testing.sql
