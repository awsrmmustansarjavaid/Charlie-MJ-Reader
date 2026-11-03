# Changelog

## Unreleased - GitHub sync and multilingual grammar

- Default repository is now https://github.com/awsrmmustansarjavaid/Charlie-MJ-Reader (branch main).
- Settings > GitHub Data Sync: full comparison (total, matching, changed, missing, extra records),
  field-by-field differences, summary statistics, and JSON / CSV / HTML report export.
- Git Pull: progress, preview of changes, per-conflict choice, automatic pre-pull backup, undo.
  Local-only records are never deleted; secrets and device settings are never overwritten.
- Security: the GitHub token is no longer written into exported or compared database files.
- Hover grammar in both readers: language, category, meaning and grammatical details for the word
  under the cursor, powered by the new language engine (see docs/LANGUAGE-ENGINE.md).

## Unreleased - Two-section article layout

- Fixed the broken logo in the toolbar injected into websites: `assets/logo.svg` is now declared in
  `web_accessible_resources`, and the browser toolbar button now has an explicit `default_icon`.
- Rebuilt byline detection to scan text nodes, so mixed markup (avatar + link + bare "3 days ago" text) is removed as one block together with the duplicate lead image.
- Fixed duplicate author photo, byline and lead image appearing in the article body, including
  resized CDN copies and names stored with different Unicode forms.
- Author headers now use the real author photo found in the article when the scraper did not store one.

- Added shared `src/lib/article-sections.css` and rewrote `src/lib/article-header.js`.
- Productivity Reader and Language Learning Reader now show **Section 1: Article Details**
  (thumbnail, title, subtitle, description with "Show more", author, and a statistics grid)
  above **Section 2: Original Article** (title, subtitle, author, date, hero image, full content).
- Publisher chrome (Search label, avatar, relative date, read time) and duplicate lead images
  are stripped from the article body by `stripPublisherChrome()`.

## v1.0.0 — final maintenance build

- Corrected the Supported Websites card layout so long domains wrap safely and Disable / Remove controls stay inside each card.
- Increased the responsive minimum website-card width for improved readability.
- Reformatted HTML, JavaScript and CSS source files into readable multi-line structure.
- Added module-level documentation comments and explanatory comments for the new Language Learning implementation.
- Added an independent Language Learning workspace linked from the supported-site toolbar and Reader Workspace.
- Reused the existing article store and shared Vocabulary records.
- Added grammar highlighting filters, editable category colors, selected-text saving, translation, browser speech, CEFR preference and JSON export.
- Preserved the extension manifest version at 1.0.0.

### Validation

- JavaScript syntax checks passed.
- CSS parser checks passed.
- JSON parsing checks passed.
- Local HTML script and stylesheet references resolved.
- Full interactive testing in a real Chrome/Edge profile remains required before deployment.

## v1.0.0 — Language Learning Library & Settings update

- Added Learning Language filter in My Reading Library and language-learning website metadata in Add Website.
- Expanded Language Learning navigation, grammar topic catalog, appearance settings, article metadata masthead, and export/import formats.
- Added learning progress counters and daily activity tracking.
- Kept the extension manifest version at 1.0.0 and preserved shared Reader article/vocabulary storage.


## v1.0.0 — Additional Language Learning and Library update

- Added an Add Website action to the Learning Language view and a Learning Language Article type in the existing Add to Library dialog.
- Added article thumbnails, source/author/publication metadata, article details and refresh actions to language-learning article cards.
- Added a dedicated right-side Grammar Tools panel in the Language Learning Reader.
- Added a grid-based Vocabulary Library for shared vocabulary, sentences, phrases, idioms, slang, expressions, proverbs, conversations/passages and grammar notes.
- Added a Bookmarks view with JSON import/export, backed by the shared Reader bookmark collection.
- Added category detail, add, rename and remove actions; added tag add, rename and remove actions. Existing global library import/export/refresh controls remain available.
- Added the ISO 639 registry (`database/languages.json`, 7,910 identifier records) for language selectors and translation preferences.
- Added script-aware font recommendations (`database/font-catalog.json`) and a bookmark backup schema (`database/bookmarks.json`).
- Added Refresh Article inside the Language Learning Reader. Productivity Reader retains its existing Refresh & Fetch workflow.
- Preserved Manifest V3 and extension version 1.0.0.

Runtime note: browser extensions cannot enumerate every font installed on the host operating system or write files into their own packaged `database/` directory. The font catalog therefore supplies language/script-aware fallback stacks, while bookmark data is stored in shared local extension storage and exported as a JSON file on demand.

## v1.0.0 — final language and typography correction
- Language Learning selectors populate from the full bundled 7,910-record ISO 639 registry.
- Grammar classification now prefers the opened article language over the learner target language, preventing Turkish articles from being analyzed as English.
- Expanded Turkish verb lexicon and common inflection endings; ambiguous forms remain unclassified rather than being confidently mislabeled.
- Added centralized script-aware font registry and fallback recommendations.
- Completed article title, subtitle, description, heading, subheading, quote and body typography selectors/styles in both reader modes.
- Replaced the Reader workspace generic icon/monogram with the official Charlie MJ Reader logo asset.
