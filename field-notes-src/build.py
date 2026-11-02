#!/usr/bin/env python3
"""Build Field Notes pages. Usage: build.py <mode> <outdir>
mode = site    -> clean URLs (/field-notes, /field-notes/<slug>, /contact, /#how)
mode = preview -> relative .html links so the set works as a standalone artifact
"""
import json, subprocess, sys, html, pathlib

mode, out = sys.argv[1], pathlib.Path(sys.argv[2])
here = pathlib.Path(__file__).parent
posts = json.loads((here / "manifest.json").read_text())
posts.sort(key=lambda p: p["n"])

SITE = "https://antimatterconsulting.com"

def L(kind, slug=None):
    """links by mode"""
    if mode == "site":
        return {"home": "/", "anchor": "/#", "contact": "/contact", "index": "/field-notes/",
                "post": f"/field-notes/{slug}", "asset": "/", "img": f"/field-notes/img/{slug}.png"}[kind]
    # preview: index at root, posts in field-notes/
    return {"home": "index.html", "anchor": "index.html#", "contact": "index.html",
            "index": "index.html", "post": f"field-notes/{slug}.html", "asset": "",
            "img": f"field-notes/img/{slug}.png"}[kind]

def rel(from_post, href):
    """in preview mode, post pages live one level down"""
    if mode == "preview" and from_post and not href.startswith(("http", "#")):
        if href.startswith("field-notes/"):
            return href[len("field-notes/"):]
        return "../" + href
    return href

CSS = r"""
  :root{
    --navy:#0a1628; --navy-2:#0f2140; --navy-3:#16305a; --deep:#07101f;
    --ink:#e9eef4; --ink-dim:#a9b8c9; --mist:#9dbccd; --mist-2:#c9dbe5; --paper:#f4f1ea;
    --orange:#f27a2c; --orange-2:#ffa364;
    --line:rgba(157,188,205,.18); --max:1180px;
    --head:'Oswald',sans-serif; --body:'Open Sans',system-ui,sans-serif;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{background:var(--navy);color:var(--ink);font-family:var(--body);font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased;overflow-x:hidden}
  a{color:inherit;text-decoration:none}
  img{max-width:100%;display:block}
  .wrap{max-width:var(--max);margin:0 auto;padding:0 28px}
  h1,h2,h3,h4{font-family:var(--head);font-weight:500;line-height:1.1;letter-spacing:.01em}
  .eyebrow{font-family:var(--head);font-weight:300;letter-spacing:.3em;text-transform:uppercase;font-size:12px;color:var(--mist);margin-bottom:18px}
  .btn{display:inline-block;font-family:var(--head);font-weight:500;letter-spacing:.08em;text-transform:uppercase;font-size:14px;padding:12px 22px;border:1px solid var(--mist);color:var(--mist-2);border-radius:2px;transition:all .2s}
  .btn:hover{background:var(--mist);color:var(--navy)}
  .mist{
    font-family:var(--head);font-weight:600;text-transform:uppercase;letter-spacing:.03em;
    color:transparent;-webkit-background-clip:text;background-clip:text;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 300' preserveAspectRatio='none'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='%23f7f5f0'/><stop offset='1' stop-color='%23d7e4ec'/></linearGradient></defs><rect width='1200' height='300' fill='url(%23s)'/><path d='M0 175 L120 120 L260 160 L400 95 L540 150 L680 105 L820 145 L960 90 L1100 135 L1200 110 L1200 300 L0 300Z' fill='%23b7cdda' opacity='.75'/><path d='M0 215 L160 170 L320 205 L480 150 L640 210 L800 160 L960 200 L1120 165 L1200 190 L1200 300 L0 300Z' fill='%2391b1c4' opacity='.8'/><path d='M0 250 L180 225 L380 245 L560 205 L760 240 L960 215 L1200 240 L1200 300 L0 300Z' fill='%236e94ab' opacity='.9'/></svg>");
    background-size:cover;background-position:center;
  }

  /* nav (solid variant for inner pages) */
  nav{position:fixed;top:0;left:0;right:0;z-index:50;background:rgba(10,22,40,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
  nav .wrap{display:flex;align-items:center;justify-content:space-between;height:68px}
  nav .brand{display:block;height:40px}
  nav .brand img{height:100%;width:auto}
  nav ul{display:flex;gap:28px;list-style:none;align-items:center}
  nav li a{font-size:14px;color:var(--ink-dim);letter-spacing:.02em}
  nav li a:hover,nav li a.on{color:var(--ink)}
  nav .btn{padding:9px 16px;font-size:12px}
  .menu{display:none;background:none;border:0;color:var(--ink);font-size:26px;cursor:pointer}

  /* field notes card — option D */
  .fn-card{container-type:inline-size;display:block;width:100%;background:var(--navy);border:1px solid rgba(157,188,205,.10);position:relative;overflow:hidden;aspect-ratio:1200/630;color:var(--ink)}
  .fn-card .in{position:absolute;inset:0;padding:5cqw 6.6cqw 5.6cqw 8.6cqw;display:flex;flex-direction:column;justify-content:space-between}
  .fn-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:1.7cqw;background:var(--orange)}
  .fn-card .top{display:flex;justify-content:space-between;align-items:baseline}
  .fn-card .no{font-family:var(--head);font-weight:300;font-size:10.6cqw;line-height:1;color:var(--mist);letter-spacing:.02em}
  .fn-card .no small{font-size:2.3cqw;letter-spacing:.3em;vertical-align:top;margin-right:1cqw;position:relative;top:1.6cqw}
  .fn-card .eb{font-family:var(--head);font-weight:300;letter-spacing:.3em;text-transform:uppercase;font-size:2cqw;color:var(--mist)}
  .fn-card .t{font-family:var(--head);font-weight:600;text-transform:uppercase;font-size:9.3cqw;line-height:.96;color:var(--ink);max-width:84cqw}
  .fn-card .t .mist{font-size:1.3em;line-height:.9;display:table;white-space:nowrap;padding-right:.04em;margin-top:.04em}
  .fn-card .t.long{font-size:7cqw}
  .fn-card .sub{font-family:var(--head);font-weight:300;letter-spacing:.14em;text-transform:uppercase;font-size:2.3cqw;color:var(--mist);margin-top:1.6cqw}
  a.fn-card{transition:transform .25s,border-color .25s}
  a.fn-card:hover{transform:translateY(-4px);border-color:var(--mist)}

  /* index */
  .fn-head{padding:130px 0 40px}
  .fn-head h1{font-size:clamp(44px,6vw,80px);line-height:1}
  .fn-head p{color:var(--ink-dim);max-width:640px;margin-top:18px;font-size:18px}
  .fn-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:28px 28px;padding:20px 0 110px}
  .fn-item .meta{display:flex;justify-content:space-between;align-items:baseline;margin:14px 2px 0;font-family:var(--head);font-weight:300;letter-spacing:.14em;text-transform:uppercase;font-size:12px;color:var(--mist)}
  .fn-item p{color:var(--ink-dim);font-size:15px;margin:6px 2px 0}

  /* post */
  .post-hero{padding:110px 0 0}
  .post-hero .fn-card{max-width:900px;margin:0 auto}
  article{max-width:720px;margin:0 auto;padding:56px 28px 90px;font-size:18px;line-height:1.75}
  article .meta{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-family:var(--head);font-weight:300;letter-spacing:.14em;text-transform:uppercase;font-size:12px;color:var(--mist);margin-bottom:34px;padding-bottom:18px;border-bottom:1px solid var(--line)}
  article p{margin:0 0 1.2em}
  article h2{font-size:30px;margin:2em 0 .7em;color:var(--mist-2)}
  article h2 a{color:var(--mist-2);border:0}article h2 a:hover{color:var(--orange-2)}
  article h3{font-size:22px;margin:1.8em 0 .6em;color:var(--mist-2);font-weight:500}
  article strong{color:var(--ink);font-weight:600}
  article em{color:var(--ink)}
  article a{color:var(--orange-2);border-bottom:1px solid rgba(255,163,100,.35)}
  article a:hover{color:var(--orange);border-color:var(--orange)}
  article blockquote{border-left:3px solid var(--orange);padding:4px 0 4px 22px;margin:0 0 1.4em;color:var(--ink-dim)}
  article blockquote p:last-child{margin-bottom:0}
  article ul,article ol{margin:0 0 1.3em 1.3em}
  article li{margin-bottom:.4em}
  article hr{border:0;border-top:1px solid var(--line);margin:2.4em 0}
  .post-nav{max-width:720px;margin:0 auto;padding:0 28px 100px;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}
  .post-nav a{font-family:var(--head);letter-spacing:.1em;text-transform:uppercase;font-size:13px;color:var(--mist)}
  .post-nav a:hover{color:var(--ink)}

  /* ---- breakouts ---- */
  article .dialog{margin:1.6em 0 1.8em;padding:6px 0 6px 26px;border-left:3px solid var(--orange)}
  article .dialog p{font-family:var(--head);font-weight:400;font-size:24px;line-height:1.3;letter-spacing:.01em;margin:0 0 .55em;color:var(--mist-2)}
  article .dialog p:nth-child(even){color:var(--ink);padding-left:1.4em}
  article .dialog p:last-child{margin-bottom:0}
  article .punch{margin:1.4em 0 1.6em}
  article .punch p{font-size:clamp(44px,7vw,72px);line-height:1;margin:0}
  article .rule{margin:1.8em 0;padding:26px 30px;border:1px solid var(--line);border-radius:10px;background:linear-gradient(180deg,rgba(22,48,90,.45),rgba(15,33,64,.25))}
  article .rule p{font-family:var(--head);font-weight:500;font-size:clamp(24px,3vw,32px);line-height:1.2;color:var(--ink);margin:0}
  article .rule p strong{color:var(--orange-2)}
  article .bad,article .good{position:relative;margin:1.4em 0;padding:22px 26px 22px 30px;border-radius:8px;background:rgba(7,16,31,.7);border:1px solid var(--line);font-size:16px;line-height:1.6;color:var(--ink-dim)}
  article .bad::before,article .good::before{content:attr(data-label);position:absolute;top:-11px;left:22px;font-family:var(--head);font-weight:500;letter-spacing:.24em;text-transform:uppercase;font-size:11px;padding:3px 10px;border-radius:2px;color:var(--navy)}
  article .bad{border-left:4px solid var(--orange)}
  article .bad::before{background:var(--orange)}
  article .good{border-left:4px solid var(--mist)}
  article .good::before{background:var(--mist)}
  article .bad p,article .good p{margin:0 0 .6em}
  article .bad p:last-child,article .good p:last-child{margin:0}
  article .bad strong,article .good strong{color:var(--ink);font-weight:600}
  article .numbered{counter-reset:nq;margin:1.2em 0}
  article .numbered h3{counter-increment:nq;position:relative;padding-left:64px;min-height:50px;display:flex;align-items:center;margin:2.2em 0 .5em;font-size:24px}
  article .numbered h3::before{content:counter(nq,decimal-leading-zero);position:absolute;left:0;top:-6px;font-family:var(--head);font-weight:300;font-size:52px;line-height:1;color:var(--orange);letter-spacing:.02em}
  article .numbered h3+p{padding-left:64px}
  article .numbered p{padding-left:64px}
  @media (max-width:900px){
    article .dialog p{font-size:20px}
    article .numbered h3,article .numbered p,article .numbered h3+p{padding-left:48px}
    article .numbered h3::before{font-size:40px;top:-2px}
    article .rule{padding:20px 22px}
  }

  /* scene: framed magazine-style sidebar */
  article .scene{position:relative;margin:2em 0 2.2em;padding:34px 36px 30px;border:1px solid var(--mist);outline:1px solid var(--line);outline-offset:5px;background:linear-gradient(180deg,rgba(22,48,90,.35),rgba(15,33,64,.15))}
  article .scene .illo{float:right;width:150px;margin:-10px -8px 6px 24px;color:var(--mist)}
  article .scene .illo svg{width:100%;height:auto;display:block}
  article .scene > p:first-of-type{font-family:var(--head);font-weight:300;letter-spacing:.22em;text-transform:uppercase;font-size:12px;color:var(--mist);margin:0 0 14px}
  article .scene > p:first-of-type strong{color:var(--orange);font-weight:500}
  article .scene p{margin:0 0 .9em;font-size:17px}
  article .scene p > em:only-child{color:var(--ink-dim);display:block;padding-bottom:14px;margin-bottom:18px;border-bottom:1px solid var(--line)}
  article .scene p.line{clear:right;display:grid;grid-template-columns:112px 1fr;column-gap:10px;align-items:baseline;font-family:var(--head);font-weight:400;font-size:23px;line-height:1.3;color:var(--mist-2);margin-bottom:.7em}
  article .scene p.line strong{font-family:var(--head);font-weight:500;letter-spacing:.14em;text-transform:uppercase;font-size:13px;color:var(--orange);padding-top:6px}
  article .scene p:last-child{margin-bottom:0}
  @media (max-width:900px){
    article .scene{padding:24px 20px 20px}
    article .scene .illo{width:96px;margin:0 0 8px 14px}
    article .scene p.line{grid-template-columns:1fr;font-size:19px;row-gap:2px}
  }

  footer{padding:56px 0 40px;border-top:1px solid var(--line);font-size:14px;color:var(--ink-dim);background:var(--deep)}
  footer .top{display:flex;justify-content:space-between;align-items:center;gap:30px;flex-wrap:wrap}
  footer .flogo{height:44px}footer .flogo img{height:100%;width:auto}
  footer ul{display:flex;gap:26px;list-style:none;flex-wrap:wrap}
  footer li a{font-family:var(--head);letter-spacing:.14em;text-transform:uppercase;font-size:12px;color:var(--ink-dim)}
  footer a:hover{color:var(--ink)}
  footer .bottom{margin-top:34px;padding-top:20px;border-top:1px solid var(--line);display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:13px}

  @media (max-width:900px){
    nav ul{display:none;position:absolute;top:68px;left:0;right:0;background:var(--navy);flex-direction:column;align-items:flex-start;padding:20px 28px 28px;gap:18px;border-bottom:1px solid var(--line)}
    nav ul.open{display:flex}
    .menu{display:block}
    .fn-grid{grid-template-columns:1fr}
    .fn-head{padding-top:100px}
    article{font-size:17px;padding-top:40px}
  }
"""


FIT_JS = """<script>
(function(){
  function fit(){
    document.querySelectorAll('.fn-card').forEach(function(c){
      var t=c.querySelector('.t'), m=c.querySelector('.mist'); if(!t||!m) return;
      var w=c.clientWidth, avail=w*0.84, h=c.clientHeight, floor=w*0.045;
      var fs=parseFloat(getComputedStyle(t).fontSize);
      var guard=0;
      while(guard++<40 && fs>floor && (m.getBoundingClientRect().width>avail || t.getBoundingClientRect().height>h*0.66)){fs*=0.95; t.style.fontSize=fs+'px';}
    });
  }
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(fit);} else {fit();}
  window.addEventListener('load',fit); window.addEventListener('resize',fit);
})();
</script>
"""

def head(title, desc, url, img, from_post):
    a = rel(from_post, L("asset"))
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Antimatter Consulting">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{html.escape(title)}">
<meta name="twitter:description" content="{html.escape(desc)}">
<meta name="twitter:image" content="{img}">
<link rel="icon" href="{a}favicon.svg" type="image/svg+xml">
<link rel="icon" href="{a}favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="{a}apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600&family=Open+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<style>{CSS}</style>
</head>
<body>
"""

def nav(from_post):
    r = lambda h: rel(from_post, h)
    a = r(L("asset"))
    A = L("anchor")
    return f"""<nav>
  <div class="wrap">
    <a class="brand" href="{r(L('home'))}"><img src="{a}logo.png" alt="Antimatter Consulting"></a>
    <button class="menu" aria-label="Menu" onclick="document.getElementById('links').classList.toggle('open')">&#9776;</button>
    <ul id="links">
      <li><a href="{r(A)}how">How it works</a></li>
      <li><a href="{r(A)}strategy">Strategy</a></li>
      <li><a href="{r(A)}agents">Agents</a></li>
      <li><a href="{r(A)}coaching">Coaching</a></li>
      <li><a href="{r(A)}about">About</a></li>
      <li><a class="on" href="{r(L('index'))}">Field notes</a></li>
      <li><a class="btn" href="{r(L('contact'))}">Contact</a></li>
    </ul>
  </div>
</nav>
"""

def footer(from_post):
    r = lambda h: rel(from_post, h)
    a = r(L("asset"))
    A = L("anchor")
    return f"""<footer>
  <div class="wrap">
    <div class="top">
      <a class="flogo" href="{r(L('home'))}"><img src="{a}logo.png" alt="Antimatter Consulting"></a>
      <ul>
        <li><a href="{r(A)}how">How it works</a></li>
        <li><a href="{r(A)}strategy">Strategy</a></li>
        <li><a href="{r(A)}agents">Agents</a></li>
        <li><a href="{r(A)}coaching">Coaching</a></li>
        <li><a href="{r(A)}about">About</a></li>
        <li><a href="{r(L('index'))}">Field notes</a></li>
        <li><a href="{r(L('contact'))}">Contact</a></li>
        <li><a href="https://linkedin.com/in/stevenlzeller" target="_blank" rel="noopener">LinkedIn</a></li>
      </ul>
    </div>
    <div class="bottom">
      <div>&copy; 2026 Antimatter Consulting &middot; New York</div>
      <div>The founder's voice in every sales and marketing touchpoint.</div>
    </div>
  </div>
</footer>
""" + FIT_JS + """</body>
</html>
"""

def card(p, href=None, tag="div"):
    # size the headline so the mist word fits one line and the lead fits two
    size = min(9.3, 84/(0.62*len(p["mist"])), 2*84/(0.46*len(p["lead"])))
    sub = (p["series"] + " · " if p["series"] else "") + p["tag"]
    inner = f"""<div class="in">
    <div class="top"><div class="no"><small>No.</small>{p['n']:02d}</div><div class="eb">Antimatter Consulting · Field notes</div></div>
    <div><div class="t" style="font-size:{size:.2f}cqw">{html.escape(p['lead'])} <span class="mist">{html.escape(p['mist'])}</span></div><div class="sub">{html.escape(sub)}</div></div>
  </div>"""
    if href:
        return f'<a class="fn-card" href="{href}" aria-label="{html.escape(p["title"])}">{inner}</a>'
    return f'<div class="fn-card">{inner}</div>'

def md_to_html(path, from_post):
    body = subprocess.run(["pandoc", str(path), "-f", "markdown", "-t", "html", "--wrap=none"],
                          capture_output=True, text=True, check=True).stdout
    # rewrite internal links for the current mode
    import re
    def fix(m):
        href = m.group(1)
        if href.startswith("/field-notes/"):
            slug = href.split("/")[-1]
            return f'href="{rel(from_post, L("post", slug))}"'
        if href == "/contact":
            return f'href="{rel(from_post, L("contact"))}"'
        return m.group(0)
    body = re.sub(r'href="([^"]+)"', fix, body)
    body = re.sub(r'<div class="punch">\s*<p>', '<div class="punch"><p class="mist">', body)
    def illo(m):
        svg = (here / "illos" / (m.group(1) + ".svg")).read_text().strip()
        return '<div class="illo">' + svg + '</div>'
    body = re.sub(r'<p><strong>([A-Z][^<:]{0,30}):</strong>', r'<p class="line"><strong>\1</strong>', body)
    body = re.sub(r'<p>\{\{illo:([a-z0-9-]+)\}\}</p>', illo, body)
    body = body.replace('<div class="bad">', '<div class="bad" data-label="Spam">').replace('<div class="good">', '<div class="good" data-label="Real">')
    body = re.sub(r'<div class="(bad|good)" label="([^"]*)">', r'<div class="\1" data-label="\2">', body)
    return body

# ---- build posts
(out / "field-notes" / "img").mkdir(parents=True, exist_ok=True)
for i, p in enumerate(posts):
    url = f"{SITE}/field-notes/{p['slug']}"
    img = f"{SITE}/field-notes/img/{p['slug']}.png"
    prev = posts[i-1] if i > 0 else None
    nxt = posts[i+1] if i < len(posts)-1 else None
    body = md_to_html(here / "posts" / p["file"], True)
    series_line = (p["series"] + " · " if p["series"] else "")
    pn = ""
    if prev: pn += f'<a href="{rel(True, L("post", prev["slug"]))}">&larr; {html.escape(prev["title"])}</a>'
    else: pn += "<span></span>"
    if nxt: pn += f'<a href="{rel(True, L("post", nxt["slug"]))}">{html.escape(nxt["title"])} &rarr;</a>'
    doc = head(p["title"] + " — Field Notes — Antimatter Consulting", p["summary"], url, img, True)
    doc += nav(True)
    doc += f"""<section class="post-hero"><div class="wrap">{card(p)}</div></section>
<article>
  <div class="meta"><span>{html.escape(series_line + p['tag'])}</span><span>Field notes No. {p['n']:02d} · Steve Zeller</span></div>
{body}
</article>
<div class="post-nav">{pn}</div>
"""
    doc += footer(True)
    (out / "field-notes" / f"{p['slug']}.html").write_text(doc)

# ---- index
items = ""
for p in reversed(posts):
    items += f"""<div class="fn-item">
  {card(p, href=rel(False, L('post', p['slug'])))}
  <div class="meta"><span>{html.escape(p['title'])}</span><span>{html.escape(p['tag'])}</span></div>
  <p>{html.escape(p['summary'])}</p>
</div>
"""
idx = head("Field Notes — Antimatter Consulting",
           "Stories and working notes from 25 years of selling and marketing B2B tech. One a month.",
           f"{SITE}/field-notes/", f"{SITE}/og-image.png", False)
idx += nav(False)
idx += f"""<section class="fn-head"><div class="wrap">
  <div class="eyebrow">Field notes</div>
  <h1 class="mist">Field notes</h1>
  <p>Stories from 25 years of selling and marketing B2B tech, and what they taught me. One a month, more or less.</p>
</div></section>
<section><div class="wrap"><div class="fn-grid">
{items}</div></div></section>
"""
idx += footer(False)
(out / ("field-notes/index.html" if mode == "site" else "index.html")).write_text(idx)

# ---- standalone card pages for PNG rendering (1200x630); preview mode only
cards_dir = out / "_cards" if mode == "preview" else here / "_cards"
cards_dir.mkdir(exist_ok=True)
for p in posts:
    doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>{CSS} body{{margin:0;background:#0a1628}} .fn-card{{width:1200px;height:630px;border:0}}</style></head>
<body>{card(p)}{FIT_JS}</body></html>"""
    (cards_dir / f"{p['slug']}.html").write_text(doc)
print("built", len(posts), "posts →", out)
