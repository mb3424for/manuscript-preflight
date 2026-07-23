#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import urlparse
import re,sys
ROOT=Path(__file__).resolve().parents[1]/'dist';errors=[]
for page in ROOT.rglob('*.html'):
    text=page.read_text(encoding='utf-8')
    for href in re.findall(r'href="([^"]+)"',text):
        if href.startswith(('http://','https://','mailto:','#')):continue
        clean=href.split('#')[0]
        target=(ROOT/clean.lstrip('/')).resolve() if clean.startswith('/') else (page.parent/clean).resolve()
        if href.endswith('/') or target.is_dir():target=target/'index.html'
        if not target.exists():errors.append(f'{page.relative_to(ROOT)} -> {href}')
if errors:
    print('\n'.join(errors));sys.exit(1)
print('Internal link check passed.')
