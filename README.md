# Manuscript Preflight Website

A deployable static website containing a privacy-first browser-based DOCX manuscript checker, focused SEO landing pages, structured data, a generated sitemap, and optional Google Search Console automation.

## What is included

- Working manuscript checker at `/manuscript-checker/`
- Crawlable homepage and focused landing pages
- Local browser processing: manuscript content is not uploaded by the free static version
- Unique titles, descriptions, canonical URLs, Open Graph data, and JSON-LD
- Responsive design and lightweight assets
- Generated `sitemap.xml`, `robots.txt`, `llms.txt`, and web manifest
- SEO validation and internal-link checking
- GitHub Pages deployment workflow
- Weekly Search Console workflow that submits the sitemap and reports:
  - queries ranking approximately positions 5–20
  - high-impression queries with low click-through rates
  - pages whose clicks have materially declined

## First deployment

1. Buy or select a domain.
2. Edit `site_config.yml`:
   - `site_url`
   - `author_name`
   - `contact_email`
   - optional analytics and Search Console verification values
3. Install dependencies:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

4. Build and validate:

```bash
python scripts/build_seo.py --site-url https://manuscriptpreflight.com
python scripts/check_links.py
```

5. Preview locally:

```bash
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000`.

## Deploy with GitHub Pages

1. Create a GitHub repository and push this folder to `main`.
2. In repository **Settings → Pages**, choose **GitHub Actions**.
3. Configure the custom domain and DNS.
4. Run the `Build and deploy website` workflow.

Cloudflare Pages, Netlify, or any static host can also deploy the `dist` folder.

## Google Search Console automation

Google does not provide a general-purpose API that forces ordinary pages into its index. Its Indexing API is restricted to qualifying job-posting and livestream pages. This project instead uses the supported Search Console Sitemap API.

To enable the weekly monitor:

1. Verify the property in Google Search Console.
2. Create a Google Cloud service account and enable the Search Console API.
3. Add the service-account email as a user of the Search Console property.
4. Store the service-account JSON in the GitHub secret `GOOGLE_SERVICE_ACCOUNT_JSON`.
5. Add repository variable `SEARCH_CONSOLE_PROPERTY`:
   - URL-prefix property: `https://manuscriptpreflight.com/`
   - Domain property: `sc-domain:manuscriptpreflight.com`
6. Keep `PUBLIC_SITE_URL` as the public HTTPS site URL.
7. Run the `Weekly SEO monitor` workflow.

The workflow uploads a report artifact. It does not auto-publish thin articles or change modification dates merely to look fresh.

## Content maintenance

Pages live in `content/pages/*.md`. Each has YAML front matter containing the slug, title, description, H1, lede, and modification date. Update the date only when the page materially changes. The build script regenerates the sitemap automatically.

## Commercial next steps

- Add a payment processor only after free usage demonstrates repeat demand.
- Add database-backed DOI verification as a clearly separate premium feature.
- Add email capture only with an explicit privacy policy and consent flow.
- Add server-side accounts only after implementing secure file handling, retention, deletion, and access controls.
- Keep citation corrections reviewable rather than silently modifying scholarly text.
