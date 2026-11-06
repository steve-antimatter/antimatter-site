#!/usr/bin/env python3
"""Regenerate src/usecase/schema.js from every file in db/migrations (in name order)."""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parents[2]
s = '\n'.join(f.read_text() for f in sorted((root / 'db/migrations').glob('*.sql')))
body = re.sub(r'--[^\n]*', '', s)
stmts, buf = [], ''
for part in body.split(';'):
    buf += part
    if re.search(r'\bBEGIN\b', buf, re.I) and not re.search(r'\bEND\s*$', buf.strip(), re.I):
        buf += ';'
        continue
    t = ' '.join(buf.split())
    if t and not t.upper().startswith('PRAGMA'):
        stmts.append(t)
    buf = ''
(root / 'src/usecase/schema.js').write_text(
    '// Generated from db/migrations/*.sql by db/tools/schema_js.py. Do not edit.\n'
    'export const SCHEMA = ' + json.dumps(stmts, indent=1) + ';\n')
print(len(stmts), 'statements')
