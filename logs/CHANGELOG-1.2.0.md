# Charlie MJ Reader 1.2.0

## Fixed
- **Add current website** now works. The Library is an extension tab, so "the active tab" was the Library itself (which cannot be captured). The button now finds your most recently used normal http/https tab, fetches its data directly and does not depend on a content script. If no web tab is open it opens an "Add by address" box.

## New
- **Automatic categories** – a site whose recent articles are ≥70 % one topic gets that category (Tech, Health, Science, Business, Lifestyle, Education, Sports, Entertainment). Mixed publishers (e.g. Medium) become **General**. Newspapers become **News**. Manual changes lock the category.
- **Newspapers / News tab** – add any newspaper in the world by address; quick-add list; filter by country.
- **Profile pages** – add Medium, DEV, Substack, Hashnode, GitHub (and generic /@name, /author/ pages). Fetches name, photo, bio, followers (when public) and recent posts.
- **Lightweight data fetch** – one page request, one feed request and one tiny ranking call per site; 12 s timeout, 700 KB cap, 3 at a time. Logo order: official schema.org logo → apple-touch-icon → site icons → Google/DuckDuckGo favicon → letter.
- **SEO** – on-page SEO score (14 checks), Tranco domain-popularity rank with 30-day trend, Google PageSpeed/Lighthouse SEO + performance scores, per-article audits with top keywords, robots.txt/sitemap detection and one-click Google `site:` searches.
- **Details button** on every website, newspaper and profile: overview, latest articles (save / SEO), SEO & ranking, saved articles, raw JSON.
- **Bundled starter list** – the 27 websites from `charlie-mj-websites.json` are loaded on install with proper categories.
- Popup: **Add this website to Library**.

## Notes
- Google offers no free keyword-position API; the SEO tab uses Google's own PageSpeed SEO score plus public ranking data instead.
- Host permissions now cover all http/https sites so data can be fetched without prompts.
