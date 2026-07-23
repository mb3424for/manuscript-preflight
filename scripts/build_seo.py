#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
from datetime import date
import argparse, json, re, shutil, html
import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape
import mistune

ROOT=Path(__file__).resolve().parents[1]
CONTENT=ROOT/'content/pages'; TEMPLATES=ROOT/'templates'; STATIC=ROOT/'static'; DIST=ROOT/'dist'

def parse_page(path):
    raw=path.read_text(encoding='utf-8')
    if not raw.startswith('---'):
        raise ValueError(f'Missing front matter: {path}')
    _, front, body=raw.split('---',2)
    meta=yaml.safe_load(front) or {}
    meta['source']=path.name
    return meta, body.strip()

def root_for(slug): return '../' if slug else ''

def canonical(site_url,slug):
    return site_url.rstrip('/') + ('/' if not slug else f'/{slug}/')

def page_jsonld(config,page,canonical_url):
    base={"@context":"https://schema.org","@type":"WebPage","name":page['title'],"description":page['description'],"url":canonical_url,"inLanguage":config.get('language','en-US')}
    if page.get('date_modified'): base['dateModified']=str(page['date_modified'])
    if page.get('slug') not in ('privacy','about','pricing','guides'):
        base['isPartOf']={"@type":"WebSite","name":config['site_name'],"url":config['site_url'].rstrip('/')+'/' }
    return json.dumps(base,ensure_ascii=False,separators=(',',':'))

def build(site_url=None):
    config=yaml.safe_load((ROOT/'site_config.yml').read_text(encoding='utf-8'))
    if site_url: config['site_url']=site_url.rstrip('/')
    if DIST.exists(): shutil.rmtree(DIST)
    DIST.mkdir(parents=True)
    shutil.copytree(STATIC,DIST/'assets')
    env=Environment(loader=FileSystemLoader(TEMPLATES),autoescape=select_autoescape(['html','xml']))
    pages=[]

    # Home
    home={"slug":"","title":f"Manuscript Submission Checker | {config['site_name']}","description":"Run a private browser-based DOCX manuscript preflight check for citation mismatches, tracked changes, comments, metadata, anonymity leaks, and journal requirements.","h1":"Check your paper before the journal does.","date_modified":"2026-07-23"}
    org={"@context":"https://schema.org","@graph":[{"@type":"Organization","name":config['site_name'],"url":config['site_url'].rstrip('/')+'/',"logo":config['site_url'].rstrip('/')+'/assets/img/logo.svg'},{"@type":"WebSite","name":config['site_name'],"url":config['site_url'].rstrip('/')+'/',"description":home['description']}]}
    html_out=env.get_template('home.html').render(config=config,page=home,canonical=canonical(config['site_url'],''),root='',jsonld=json.dumps(org,separators=(',',':')))
    (DIST/'index.html').write_text(html_out,encoding='utf-8'); pages.append(home)

    # App
    app={"slug":"manuscript-checker","title":f"Free Manuscript Submission Checker | {config['site_name']}","description":"Check a DOCX for citation-reference mismatches, comments, tracked changes, metadata, placeholders, anonymity leaks, abstract limits, keywords, and required sections.","h1":"Manuscript submission checker","date_modified":"2026-07-23"}
    app_schema={"@context":"https://schema.org","@graph":[{"@type":"SoftwareApplication","name":"Manuscript Preflight Checker","applicationCategory":"EducationalApplication","operatingSystem":"Web browser","url":canonical(config['site_url'],app['slug']),"description":app['description'],"offers":{"@type":"Offer","price":"0","priceCurrency":"USD"},"isAccessibleForFree":True},{"@type":"WebPage","name":app['title'],"url":canonical(config['site_url'],app['slug']),"description":app['description']}]}
    outdir=DIST/app['slug'];outdir.mkdir(parents=True)
    outdir.joinpath('index.html').write_text(env.get_template('app.html').render(config=config,page=app,canonical=canonical(config['site_url'],app['slug']),root='../',jsonld=json.dumps(app_schema,separators=(',',':'))),encoding='utf-8');pages.append(app)

    # Markdown pages
    md=mistune.create_markdown(escape=False,plugins=['table'])
    for path in sorted(CONTENT.glob('*.md')):
        meta,body=parse_page(path);slug=meta['slug'];content=md(body)
        content=content.replace('{{CONTACT_EMAIL}}',html.escape(config.get('contact_email','')))
        page=dict(meta);page['lede']=page.get('lede','');page['h1']=page.get('h1',page['title'])
        outdir=DIST/slug;outdir.mkdir(parents=True)
        rendered=env.get_template('page.html').render(config=config,page=page,content=content,canonical=canonical(config['site_url'],slug),root='../',jsonld=page_jsonld(config,page,canonical(config['site_url'],slug)))
        outdir.joinpath('index.html').write_text(rendered,encoding='utf-8');pages.append(page)

    # 404 noindex
    (DIST/'404.html').write_text('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Page not found</title><h1>Page not found</h1><p><a href="/">Return to Manuscript Preflight</a></p>',encoding='utf-8')

    # robots, sitemap, feed, manifest, llms
    urls=[]
    for p in pages:
        urls.append({'loc':canonical(config['site_url'],p['slug']),'lastmod':str(p.get('date_modified','2026-07-23'))})
    sitemap=['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:sitemap.append(f"  <url><loc>{html.escape(u['loc'])}</loc><lastmod>{u['lastmod']}</lastmod></url>")
    sitemap.append('</urlset>');(DIST/'sitemap.xml').write_text('\n'.join(sitemap)+'\n',encoding='utf-8')
    (DIST/'robots.txt').write_text(f"User-agent: *\nAllow: /\nSitemap: {config['site_url'].rstrip('/')}/sitemap.xml\n",encoding='utf-8')
    (DIST/'CNAME').write_text('manuscriptpreflight.com\n',encoding='utf-8')
    (DIST/'manifest.webmanifest').write_text(json.dumps({"name":config['site_name'],"short_name":"Preflight","start_url":"/","display":"standalone","background_color":"#f4f7fa","theme_color":"#155dfc","icons":[{"src":"/assets/img/logo.svg","sizes":"any","type":"image/svg+xml"}]},indent=2),encoding='utf-8')
    llms=[f"# {config['site_name']}","",config['site_tagline'],"","## Primary tool",f"- {canonical(config['site_url'],'manuscript-checker')}: Private local DOCX pre-submission checker.","","## Guides"]
    for p in pages:
        if p['slug'] not in ('','manuscript-checker','privacy','about','pricing','guides'):llms.append(f"- {canonical(config['site_url'],p['slug'])}: {p['description']}")
    (DIST/'llms.txt').write_text('\n'.join(llms)+'\n',encoding='utf-8')

    # SEO validation report
    report=validate(DIST,config)
    (ROOT/'SEO_REPORT.md').write_text(report,encoding='utf-8')
    print(report)

def validate(dist,config):
    pages=list(dist.rglob('*.html'));titles={};descs={};errors=[]
    for path in pages:
        text=path.read_text(encoding='utf-8')
        title=(re.search(r'<title>(.*?)</title>',text,re.S) or [None,''])[1].strip()
        desc=(re.search(r'<meta name="description" content="([^"]*)"',text) or [None,''])[1].strip()
        if path.name!='404.html':
            if not title:errors.append(f'Missing title: {path.relative_to(dist)}')
            if not desc:errors.append(f'Missing description: {path.relative_to(dist)}')
            if text.count('<h1')!=1:errors.append(f'Expected one H1: {path.relative_to(dist)} ({text.count("<h1")})')
            if '<link rel="canonical"' not in text:errors.append(f'Missing canonical: {path.relative_to(dist)}')
        titles.setdefault(title,[]).append(str(path.relative_to(dist)));descs.setdefault(desc,[]).append(str(path.relative_to(dist)))
    for t,ps in titles.items():
        if t and len(ps)>1:errors.append(f'Duplicate title {t}: {ps}')
    for d,ps in descs.items():
        if d and len(ps)>1:errors.append(f'Duplicate description: {ps}')
    status='PASS' if not errors else 'FAIL'
    lines=[f'# SEO build report','',f'- Status: **{status}**',f'- HTML pages: **{len(pages)}**',f'- Site URL: `{config["site_url"]}`',f'- Generated sitemap: `dist/sitemap.xml`','', '## Validation findings']
    lines += ['- None.'] if not errors else [f'- {e}' for e in errors]
    lines += ['', '## Automated maintenance', '- Sitemap and robots files are generated from page metadata.', '- Search Console automation can submit the sitemap and produce weekly opportunity reports.', '- The workflow does not change page dates unless the source metadata changes.']
    return '\n'.join(lines)+'\n'

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--site-url');args=ap.parse_args();build(args.site_url)
