#!/usr/bin/env python3
"""Move a use case between its JSON form and the Mazinator database.

  usecase.py sql    seed.json              > seed.sql   # INSERTs for D1 / sqlite
  usecase.py load   seed.json  db.sqlite                # apply directly (local testing)
  usecase.py export db.sqlite  <use_case_id>            # rebuild the JSON from the tables

The JSON shape is the contract between the database, the authoring chat
(which edits it) and the page/PDF renderer (which draws it).
"""
import json, sqlite3, sys

LIB_TABLES = [  # order matters for foreign keys
    ("products",    ["id", "name", "summary", "logo_asset", "sort"]),
    ("industries",  ["id", "name"]),
    ("personas",    ["id", "name", "descriptor"]),
    ("sources",     ["id", "title", "url", "publisher"]),
    ("partners",    ["id", "name", "program", "source_id"]),
    ("competitors", ["id", "name", "products", "url"]),
    ("customers",   ["id", "name", "display_name", "anonymous", "industry_id", "descriptor"]),
    ("quotes",      ["id", "customer_id", "text", "speaker_name", "speaker_title", "source_id"]),
]


def statements(doc):
    """Yield (sql, params) pairs that insert libraries (upsert) and the use case (replace)."""
    libs = doc.get("libraries", {})
    for table, cols in LIB_TABLES:
        for row in libs.get(table, []):
            vals = [int(row[c]) if isinstance(row.get(c), bool) else row.get(c) for c in cols]
            upd = ", ".join(f"{c}=excluded.{c}" for c in cols[1:])
            yield (f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))}) "
                   f"ON CONFLICT(id) DO UPDATE SET {upd}", vals)

    u = doc["use_case"]
    uid = u["id"]
    yield ("DELETE FROM use_cases WHERE id = ?", [uid])  # cascades to every child table
    yield ("INSERT INTO use_cases (id, title, author, created_on, status, problem, position, pain_points_note) "
           "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
           [uid, u["title"], u["author"], u["created_on"], u.get("status", "draft"),
            u["problem"], u["position"], u.get("pain_points_note")])
    for i, r in enumerate(u.get("industries", []), 1):
        yield ("INSERT INTO use_case_industries (use_case_id, industry_id, sort, label, drives_need) VALUES (?, ?, ?, ?, ?)",
               [uid, r["industry_id"], i, r.get("label"), r["drives_need"]])
    for i, r in enumerate(u.get("personas", []), 1):
        yield ("INSERT INTO use_case_personas (use_case_id, persona_id, sort, descriptor, role_in_deal, cares_about) VALUES (?, ?, ?, ?, ?, ?)",
               [uid, r["persona_id"], i, r.get("descriptor"), r["role_in_deal"], r["cares_about"]])
    for i, r in enumerate(u.get("pain_points", []), 1):
        yield ("INSERT INTO pain_points (id, use_case_id, product_id, sort, title, detail, fix) VALUES (?, ?, ?, ?, ?, ?, ?)",
               [r["id"], uid, r["product_id"], i, r["title"], r["detail"], r["fix"]])
        for p in r.get("personas", []):
            yield ("INSERT INTO pain_point_personas VALUES (?, ?)", [r["id"], p])
        for ind in r.get("industries", []):
            yield ("INSERT INTO pain_point_industries VALUES (?, ?)", [r["id"], ind])
    for i, r in enumerate(u.get("customers", []), 1):
        yield ("INSERT INTO use_case_customers (use_case_id, customer_id, sort, quote_id, what_they_did, source_id, source_label) VALUES (?, ?, ?, ?, ?, ?, ?)",
               [uid, r["customer_id"], i, r.get("quote_id"), r["what_they_did"], r["source_id"], r.get("source_label", "Case study")])
    for i, r in enumerate(u.get("partners", []), 1):
        yield ("INSERT INTO use_case_partners (use_case_id, partner_id, sort, why_it_matters) VALUES (?, ?, ?, ?)",
               [uid, r["partner_id"], i, r["why_it_matters"]])
    for i, r in enumerate(u.get("competitors", []), 1):
        yield ("INSERT INTO use_case_competitors (use_case_id, competitor_id, sort, their_pitch, how_we_win, url) VALUES (?, ?, ?, ?, ?, ?)",
               [uid, r["competitor_id"], i, r["their_pitch"], r["how_we_win"], r.get("url")])
    for i, r in enumerate(u.get("objections", []), 1):
        yield ("INSERT INTO objections (id, use_case_id, sort, objection, response) VALUES (?, ?, ?, ?, ?)",
               [f"{uid}-obj-{i}", uid, i, r["objection"], r["response"]])
    n = 0
    for g in u.get("sources", []):
        for sid in g["ids"]:
            n += 1
            yield ("INSERT INTO use_case_sources (use_case_id, source_id, grp, sort) VALUES (?, ?, ?, ?)",
                   [uid, sid, g["grp"], n])


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def to_sql(doc):
    out = []
    for sql, params in statements(doc):
        parts = sql.split("?")
        out.append("".join(p + (lit(params[i]) if i < len(params) else "") for i, p in enumerate(parts)) + ";")
    return "\n".join(out) + "\n"


def load(doc, db):
    con = sqlite3.connect(db)
    con.execute("PRAGMA foreign_keys = ON")
    with con:
        for sql, params in statements(doc):
            con.execute(sql, params)
    con.close()


def export(db, uid):
    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row
    q = lambda sql, *a: [dict(r) for r in con.execute(sql, a)]
    u = q("SELECT * FROM use_cases WHERE id = ?", uid)
    if not u:
        sys.exit(f"no use case {uid}")
    u = u[0]
    u.pop("updated_at", None)
    out = {k: u[k] for k in ["id", "title", "author", "created_on", "status", "problem", "position"]}
    out["industries"] = q("SELECT industry_id, label, drives_need FROM use_case_industries WHERE use_case_id=? ORDER BY sort", uid)
    out["personas"] = q("SELECT persona_id, descriptor, role_in_deal, cares_about FROM use_case_personas WHERE use_case_id=? ORDER BY sort", uid)
    pps = q("SELECT id, product_id, title, detail, fix FROM pain_points WHERE use_case_id=? ORDER BY sort", uid)
    for p in pps:
        p["personas"] = [r["persona_id"] for r in q("SELECT persona_id FROM pain_point_personas WHERE pain_point_id=?", p["id"])]
        p["industries"] = [r["industry_id"] for r in q("SELECT industry_id FROM pain_point_industries WHERE pain_point_id=?", p["id"])]
    out["pain_points"] = pps
    out["pain_points_note"] = u["pain_points_note"]
    out["customers"] = q("SELECT customer_id, quote_id, what_they_did, source_id, source_label FROM use_case_customers WHERE use_case_id=? ORDER BY sort", uid)
    out["partners"] = q("SELECT partner_id, why_it_matters FROM use_case_partners WHERE use_case_id=? ORDER BY sort", uid)
    out["competitors"] = q("SELECT competitor_id, url, their_pitch, how_we_win FROM use_case_competitors WHERE use_case_id=? ORDER BY sort", uid)
    out["objections"] = q("SELECT objection, response FROM objections WHERE use_case_id=? ORDER BY sort", uid)
    groups = []
    for r in q("SELECT grp, source_id FROM use_case_sources WHERE use_case_id=? ORDER BY sort", uid):
        if not groups or groups[-1]["grp"] != r["grp"]:
            groups.append({"grp": r["grp"], "ids": []})
        groups[-1]["ids"].append(r["source_id"])
    out["sources"] = groups
    out["tags"] = q("SELECT kind, tag FROM use_case_tags WHERE use_case_id=? ORDER BY kind, tag", uid)
    return out


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "sql":
        sys.stdout.write(to_sql(json.load(open(sys.argv[2]))))
    elif cmd == "load":
        load(json.load(open(sys.argv[2])), sys.argv[3])
    elif cmd == "export":
        print(json.dumps(export(sys.argv[2], sys.argv[3]), indent=2, ensure_ascii=False))
    else:
        sys.exit(__doc__)
