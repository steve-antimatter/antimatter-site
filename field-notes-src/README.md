# Field Notes build

Posts are markdown files in `posts/`, listed in `manifest.json` (number, slug, title, card headline split into `lead` + `mist` word, series, tag, one-line summary).

To add a post:
1. Write `posts/NN-slug.md` (body only, no title; links to other posts as `/field-notes/<slug>`, CTA as `/contact`).
2. Add its entry to `manifest.json`.
3. From the repo root: `python3 -I field-notes-src/build.py site .`
4. Render the share image: `python3 field-notes-src/shoot.py .` (needs Playwright + Oswald installed locally), or let Claude do it.
5. Commit and push. Cloudflare builds in about a minute.

Index: `/field-notes/`. Posts: `/field-notes/<slug>`. Share images: `/field-notes/img/<slug>.png`.
