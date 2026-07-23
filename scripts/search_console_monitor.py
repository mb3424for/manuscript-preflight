#!/usr/bin/env python3
"""Weekly Google Search Console monitor.

Requires:
- A verified Search Console property.
- A Google Cloud service account with Search Console access.
- GOOGLE_SERVICE_ACCOUNT_JSON containing the JSON credential or a file path.
- SITE_URL matching the exact Search Console property, e.g. sc-domain:manuscriptpreflight.com or https://manuscriptpreflight.com/.

The script submits sitemap.xml and creates a report of near-ranking queries, low-CTR pages,
and declining pages. It does not use Google's restricted Indexing API.
"""
from __future__ import annotations
import os,json,datetime,urllib.parse
from pathlib import Path
from google.oauth2 import service_account
from googleapiclient.discovery import build

ROOT=Path(__file__).resolve().parents[1]
SCOPES=['https://www.googleapis.com/auth/webmasters']

def credentials():
    raw=os.environ['GOOGLE_SERVICE_ACCOUNT_JSON']
    if raw.lstrip().startswith('{'):
        info=json.loads(raw);return service_account.Credentials.from_service_account_info(info,scopes=SCOPES)
    return service_account.Credentials.from_service_account_file(raw,scopes=SCOPES)

def query(service,site,start,end,dimensions):
    body={'startDate':start,'endDate':end,'dimensions':dimensions,'rowLimit':25000,'dataState':'final'}
    return service.searchanalytics().query(siteUrl=site,body=body).execute().get('rows',[])

def main():
    site=os.environ['SITE_URL'];public=os.environ.get('PUBLIC_SITE_URL',site if site.startswith('http') else '')
    service=build('searchconsole','v1',credentials=credentials(),cache_discovery=False)
    sitemap=(public.rstrip('/')+'/sitemap.xml') if public else os.environ['SITEMAP_URL']
    service.sitemaps().submit(siteUrl=site,feedpath=sitemap).execute()
    today=datetime.date.today();end=today-datetime.timedelta(days=3);start=end-datetime.timedelta(days=27)
    prev_end=start-datetime.timedelta(days=1);prev_start=prev_end-datetime.timedelta(days=27)
    qp=query(service,site,str(start),str(end),['query','page'])
    current_pages=query(service,site,str(start),str(end),['page']);previous_pages=query(service,site,str(prev_start),str(prev_end),['page'])
    near=[];low_ctr=[]
    for row in qp:
        q,p=row['keys'];pos=row.get('position',0);impr=row.get('impressions',0);ctr=row.get('ctr',0)
        if impr>=10 and 4.5<=pos<=20:near.append({'query':q,'page':p,'impressions':impr,'clicks':row.get('clicks',0),'ctr':ctr,'position':pos})
        if impr>=25 and ctr<.02:low_ctr.append({'query':q,'page':p,'impressions':impr,'clicks':row.get('clicks',0),'ctr':ctr,'position':pos})
    prev={r['keys'][0]:r for r in previous_pages};declining=[]
    for r in current_pages:
        page=r['keys'][0];old=prev.get(page);cur=r.get('clicks',0)
        if old and old.get('clicks',0)>=5 and cur<old.get('clicks',0)*.7:declining.append({'page':page,'current_clicks':cur,'previous_clicks':old.get('clicks',0),'current_impressions':r.get('impressions',0)})
    near.sort(key=lambda x:(x['position'],-x['impressions']));low_ctr.sort(key=lambda x:-x['impressions']);declining.sort(key=lambda x:x['current_clicks']-x['previous_clicks'])
    report={'period':{'start':str(start),'end':str(end)},'sitemap_submitted':sitemap,'near_win_queries':near[:100],'low_ctr_queries':low_ctr[:100],'declining_pages':declining[:100]}
    out=ROOT/'reports';out.mkdir(exist_ok=True);(out/'search_console_opportunities.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    md=['# Weekly Search Console opportunities','',f"Period: {start} to {end}",'',f"Sitemap submitted: `{sitemap}`",'', '## Queries ranking roughly positions 5–20']
    md += [f"- **{x['query']}** — position {x['position']:.1f}, {x['impressions']} impressions, page `{x['page']}`" for x in near[:30]] or ['- None yet.']
    md += ['', '## High-impression queries with CTR below 2%']
    md += [f"- **{x['query']}** — CTR {x['ctr']*100:.1f}%, position {x['position']:.1f}, page `{x['page']}`" for x in low_ctr[:30]] or ['- None yet.']
    md += ['', '## Pages with material click decline']
    md += [f"- `{x['page']}` — {x['previous_clicks']} → {x['current_clicks']} clicks" for x in declining[:30]] or ['- None yet.']
    md += ['', '## Decision rules', '- Improve pages already receiving impressions before creating new pages.', '- Test titles and descriptions for high-impression, low-CTR queries.', '- Refresh a declining page only when its underlying information or usefulness can genuinely improve.', '- Do not generate thin pages for every query.']
    (out/'search_console_opportunities.md').write_text('\n'.join(md)+'\n',encoding='utf-8')
    print('\n'.join(md))
if __name__=='__main__':main()
