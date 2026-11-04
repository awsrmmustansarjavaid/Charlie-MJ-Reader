# Charlie MJ Reader

<p align="center">
  <strong>Read Smarter. Learn Deeper. Build Your Knowledge.</strong><br>
  A local-first reading, research, language-learning and productivity workspace for Chrome.
</p>

<p align="center">
  <img src="assets/logo.svg" alt="Charlie MJ Reader logo" width="110">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Version-1.0.0-informational" alt="Version 1.0.0">
  <img src="https://img.shields.io/badge/Build-No%20build%20step-brightgreen" alt="No build step">
  <img src="https://img.shields.io/badge/Storage-Local--first-success" alt="Local-first">
  <img src="https://img.shields.io/badge/License-MIT-lightgrey" alt="MIT license">
</p>

Charlie MJ Reader is a Chrome Manifest V3 extension that turns the websites you choose into a connected reading and learning environment. Capture articles, read in a dedicated workspace, listen with synchronized highlighting, save useful passages and vocabulary, organize websites and publications, review learning material, and export portable backups.

**Privacy by design:** the extension is active only on websites you explicitly add to **Settings → Supported Websites**. Other websites remain asleep and are not enhanced or tracked by the page-reading features.

> This repository documents the shipped v1.0.0 implementation. Feature descriptions and limitations below distinguish working functionality from settings or future-facing preparation.

---

## Contents

- [At a glance](#at-a-glance)
- [Core capabilities](#core-capabilities)
- [Supported Websites and sleep mode](#supported-websites-and-sleep-mode)
- [Reading Workspace](#reading-workspace)
- [Smart Audio Reader](#smart-audio-reader)
- [Capture, notes and saved content](#capture-notes-and-saved-content)
- [Vocabulary and language learning](#vocabulary-and-language-learning)
- [My Reading Library](#my-reading-library)
- [Focus and productivity tools](#focus-and-productivity-tools)
- [Medium compatibility](#medium-compatibility)
- [Settings, storage and exports](#settings-storage-and-exports)
- [Privacy, permissions and security](#privacy-permissions-and-security)
- [Installation](#installation)
- [Project structure](#project-structure)
- [Documentation index](#documentation-index)
- [Known limitations](#known-limitations)
- [Development and quality](#development-and-quality)
- [License](#license)

## At a glance

| Area | What it provides |
|---|---|
| Website-aware activation | Per-site allowlist, sleep mode, subdomain and path restrictions |
| Reading | Article capture, structured reader, themes, typography and table of contents |
| Audio | Browser speech synthesis, sentence navigation, word/sentence highlighting and resume |
| Knowledge capture | Highlights, quotes, paragraphs, selections, notes and bookmarks |
| Vocabulary | Definitions, translations, examples, categories, tags and revision quiz |
| Language learning | Learning article view, grammar highlighting, CEFR preferences and learning records |
| Research library | Website, newspaper and author/profile organization with metadata and SEO tools |
| Productivity | Focus controls, native page reading, Pomodoro and 80/20 timers |
| Data portability | Article exports, vocabulary exports, JSON backup/restore and database ZIP |
| Compatibility | Medium/Freedium handling and validated adapter-package import |

## Core capabilities

### 1. Supported Websites and sleep mode

The **Supported Websites** list is the master activation gate. A website must be listed and enabled before page-level reading tools run.

- Add, disable, enable or remove website profiles.
- Optionally include subdomains.
- Restrict activation to **Only these paths** or exclude **Never on these paths**.
- Test a URL to see whether it will be Active or Sleeping.
- Configure page features per website: toolbar, selection toolbar, vocabulary, media/listening, focus, productivity, native reading, reading tracking, auto-scroll and article detection.
- Changes are applied to already-open tabs; disabling or removing a site cleans up extension-owned page UI and behavior.
- The popup reports the current tab's state. The extension icon uses a grey `zzz` badge while a page is sleeping.

When a page is sleeping, the extension does not display its reading interface, track reading, inject page styles, or run its page-level reading features. The extension's own pages (Reader Workspace, Library and Settings) remain available.

### 2. Floating page toolbars

On supported pages, the extension can provide several configurable toolbars:

- **Main toolbar:** open Reader Workspace, Vocabulary, Productivity Reader, Focus and Productivity tools; toggle night appearance; hide the toolbar.
- **Selection toolbar:** translate or look up selected text, save vocabulary, quote, paragraph or custom selection, copy text, add a note and access pronunciation.
- **Media controls:** start listening and access playback-related controls.
- **Productivity controls:** focus appearance, day/night mode, Pomodoro, 80/20 and native-reading actions.

Toolbar layout options include floating, navbar, sidebar, right-sidebar, bottom-navbar and bubble styles. Position, opacity, appearance and per-site overrides are configurable. Buttons provide busy/active feedback and short action confirmations.

### 3. Reader Workspace

The full-page Reader Workspace brings saved reading material and personal knowledge into one place.

**Workspace areas include:**
- Dashboard and reading overview
- My Library / saved articles
- Productivity Reader
- See Saved
- Bookmarks and reading history
- Highlights, notes, quotes and paragraphs
- Vocabulary and collections
- Reading analytics
- Export center
- Language Learning entry points

**Article reading experience:**
- Captures article title, source URL, author and available page metadata such as description, image and publication date.
- Presents cleaned, structured article content, including supported headings, paragraphs, lists, quotations, tables, code and links.
- Builds a table of contents from article headings.
- Offers typography, content width, line-height and reader theme controls.
- Restores saved reading progress and supports mouse/reading-focus assistance where available.
- Provides contextual capture tools for vocabulary, quotes, paragraphs and custom selections.

The Article Library and My Reading Library's Saved Articles view use the same saved article records rather than intentionally creating a second copy.

### 4. Smart Audio Reader

Listen to saved articles using voices supplied by the browser and operating system.

- Play, pause, resume and stop.
- Move to the previous or next sentence.
- View playback progress, estimated word count and current reading position.
- Adjust speech rate, pitch and voice.
- Choose word, sentence or combined highlighting.
- Auto-scroll with the active passage.
- Use focus mode while listening.
- Set a sleep timer.
- Bookmark the current position and add a note at that position.
- Repeat the current word.
- Optionally continue to the next saved article.
- Use keyboard shortcuts while the reader is active: **Space** for play/pause, **Left/Right** for sentence navigation and **B** for bookmark.

Progress is saved with the article and can be restored. Word-level highlighting depends on speech-boundary events from the selected system voice; an estimated timing fallback is approximate.

### 5. Capture, notes and saved content

Save useful information while browsing or reading.

| Saved item | Typical use |
|---|---|
| Highlights | Mark important passages |
| Quotes | Keep a sentence or quotation with its source |
| Paragraphs / lines | Save a complete paragraph or selected line |
| Custom selections | Keep arbitrary selected text |
| Notes | Attach personal comments to an article or reading position |
| Bookmarks | Return to a location in an article |
| Collections | Group related saved material |

Capture can be initiated from the popup, supported-page toolbar, selection toolbar or context menu. Saved records retain source information where available, including article title, URL and domain. The **See Saved** view organizes captured items by article and offers detail views and search.

### 6. Vocabulary and language learning

**Vocabulary workspace**
- Store the original word or phrase, translation, definition, example, example translation, pronunciation, part of speech, synonyms, tags and notes.
- Organize entries with nested categories and subcategories.
- Search, copy, edit, delete and mark entries as mastered.
- Use the built-in revision quiz.
- Export vocabulary as Markdown, CSV or JSON.
- Request translation through the configured MyMemory endpoint. Only the selected text is sent when the user explicitly requests translation.

**Language Learning workspace**
- Open learning articles from the shared article library.
- Organize learning websites and mark their learning language.
- Save shared vocabulary, sentences, expressions and grammar notes from selected text.
- Use grammar-category highlighting and configurable highlight appearance.
- Set a target language, learner level and target CEFR level (A1–C2), plus a daily learning goal.
- View estimated article difficulty and learning progress.
- Export learning records and import JSON backups by merging learning records.

Language Learning reuses the existing article and vocabulary collections. Grammar highlighting is a lightweight aid, not a complete parser. CEFR difficulty is an estimate, not a certified assessment.

### 7. My Reading Library

My Reading Library organizes sources and publication profiles independently of the Supported Websites activation list.

Its views include:
- Websites
- Newspapers / News
- Profile Pages
- Favorites
- Categories and Tags
- Saved Articles
- Recent and All Saved
- General Settings
- Compatibility Adapters

Available workflows include adding a current website or source address, refreshing metadata, importing and exporting library data, browsing newspapers by country, and organizing author or publication profiles. Website records can include logos, categories, tags and detail views.

**Research and site intelligence** includes available overview and latest-article information, a 14-check on-page SEO score, Tranco ranking and trend, Google PageSpeed/Lighthouse data, per-article audits, robots.txt and sitemap detection, and Google `site:` search shortcuts. These tools depend on public source availability and network access.

### 8. Article Library

The Article Library provides a management view over saved article records:

- Search saved articles by title, site and available content.
- Refresh or fetch article content.
- Open article details, edit records and remove saved articles.
- Import, export and download article data.
- Connect to the matching saved article in My Reading Library / See Saved.

Saving the same article again is designed to avoid duplicate records; a more complete capture can refresh an earlier incomplete copy.

### 9. Focus and productivity tools

**Focus and appearance**
- Adjust brightness, contrast, opacity, dimming, blur, warmth and font scale.
- Hide large images and apply Day, Night or Auto appearance.
- Use best-effort ad hiding (not a full ad blocker).
- Configure native word-by-word reading with timing, delay, colors and optional auto-scroll.

**Productivity**
- Pomodoro timer.
- 80/20 timer.
- Configurable durations and page toolbar controls.

Per-site switches let users disable these tools on individual supported websites.

### 10. Medium compatibility

Medium articles can be routed through a configurable Freedium mirror. The extension attempts to extract the article content returned by the mirror and can replace an incomplete saved copy when a longer capture becomes available.

Compatibility adapter packages can be imported as ZIP files. Package paths, metadata, versions, compression, file counts and file sizes are validated. Imported JavaScript is stored as data and is **not executed** by the extension.

Charlie MJ Reader does not bypass Medium authentication, memberships, paywalls or quotas.

### 11. Settings, storage and exports

The Settings center groups controls for:
- My Reading Library
- Smart Audio Reader
- General settings
- Appearance and themes
- Toolbars
- Supported Websites
- Reading and highlight preferences
- Text-to-speech
- Vocabulary
- AI configuration
- Notifications
- Storage and backup
- Privacy and permissions
- Medium compatibility
- Knowledge intelligence and topics
- Productivity center
- Performance and diagnostics
- Database manager
- GitHub Data Sync preparation
- Focus

**Data portability**
- Export articles as Markdown, TXT, HTML or JSON.
- Export vocabulary and learning data in supported formats.
- Export captures and saved records.
- Create and restore a validated full JSON backup.
- Export the database as a ZIP.
- Use the Database Manager's portable data-tree workflow.

GitHub Data Sync is preparation tooling: it can compare library data and prepare a difference ZIP or manual folder write. It does not provide automatic GitHub push or pull.

## Supported browser and installation

- Google Chrome or a Chromium-based browser with Manifest V3 support.
- No Node.js, package manager or build step is required for the unpacked extension.
- Browser-internal pages such as `chrome://` and some built-in PDF viewers cannot host the page toolbar.

### Load unpacked

1. Extract the extension project.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted `Charlie-MJ-Reader` project folder — the folder containing `manifest.json`.
6. Pin the extension, open its Settings and add your preferred sites under **Supported Websites**.

See the complete [Installation Guide](docs/INSTALLATION.md) for first-run setup and troubleshooting.

## Project structure

```text
Charlie-MJ-Reader/
├── assets/                 # Extension icons, logo and visual assets
├── database/               # Bundled website and reference data
├── docs/                   # User, feature, architecture and security documentation
├── extensions/adapters/    # Adapter package documentation / examples
├── src/
│   ├── background/         # MV3 service worker and context-menu workflows
│   ├── content/            # Supported-page toolbar and page interactions
│   ├── language-learning/  # Language Learning workspace
│   ├── lib/                # Storage, extraction, site gate and language engine
│   ├── library/            # My Reading Library
│   ├── options/             # Settings center
│   ├── popup/               # Browser action popup
│   └── reader/              # Reader Workspace and saved-content views
├── manifest.json
└── README.md
```

## Documentation index

The `docs/` directory contains the detailed project documentation. Start with the [Documentation Home](docs/README.md).

| Document | Description |
|---|---|
| [Installation Guide](docs/INSTALLATION.md) | Browser requirements, unpacked installation, first run, updates and troubleshooting |
| [User Guide](docs/USER-GUIDE.md) | Supported sites, toolbars, capture, reading, vocabulary, library and exports |
| [Feature Matrix](docs/FEATURES.md) | Implemented capabilities, scope and known exclusions |
| [Architecture & Developer Guide](docs/DEVELOPMENT.md) | Runtime surfaces, activation gate, data model and development practices |
| [Privacy, Permissions & Security](docs/PRIVACY.md) | Local storage, network requests, browser permissions and security boundaries |
| [Smart Audio Reader](docs/SMART-AUDIO-READER.md) | Audio workflow, controls, shortcuts, progress and speech limitations |
| [Language Learning](docs/LANGUAGE-LEARNING.md) | Learning workspace, shared records, grammar tools and CEFR preferences |
| [Language Engine](docs/LANGUAGE-ENGINE.md) | Language detection, analyzer pipeline and extension points |
| [Adapter Packages](docs/ADAPTER-PACKAGES.md) | Adapter ZIP format, validation and import process |
| [Manual QA Checklist](docs/QA-CHECKLIST.md) | Installation, activation, toolbar, capture and learning test scenarios |
| [Project Blueprint Source Note](docs/PROJECT-BLUEPRINT-SOURCE.md) | Context about the original product specification |

## Privacy, permissions and security

Charlie MJ Reader stores its main library and settings in Chrome extension local storage. It does not require an account or remote user database.

Some optional features make network requests when used:
- Dictionary lookup: `api.dictionaryapi.dev`
- Translation: `api.mymemory.translated.net`
- Medium mirror: configured Freedium service
- Website metadata and performance information: public website and ranking/performance sources

AI-related settings are configuration only in this release; article text is not sent to an AI service. Fetched HTML is sanitized before display, inline event handlers and `javascript:` URLs are removed, and imported adapter scripts are not executed.

Read [Privacy, Permissions & Security](docs/PRIVACY.md) before enabling the extension on sites containing sensitive material.

## Known limitations

- AI summaries, article Q&A and flashcards are not implemented; AI configuration is not evidence that those workflows are active.
- There is no semantic search engine, knowledge graph, cloud account or automatic cloud synchronization.
- GitHub Data Sync does not automatically push or pull repository data.
- Spaced repetition is basic; there is no adaptive scheduling engine or operating-system reminder scheduler.
- No true PDF or DOCX document-generation workflow is included.
- Browser speech voices and word-boundary events vary; word timing can be approximate.
- Grammar highlighting and CEFR difficulty are heuristic learning aids, not formal linguistic analysis or assessment.
- Ad hiding is best-effort and is not a replacement for a dedicated content blocker.
- Article extraction and metadata availability vary by website.
- No Medium account, membership or quota status is accessed or bypassed.

## Development and quality

The extension uses plain JavaScript and Manifest V3 with no build step. Page-level behavior must pass through the Supported Websites gate. Treat all page content and imported metadata as untrusted input; escape UI text and sanitize fetched article HTML.

Before release, follow the [Manual QA Checklist](docs/QA-CHECKLIST.md). Architecture, extension points and conventions are documented in the [Developer Guide](docs/DEVELOPMENT.md).

## License

MIT. See the repository's `LICENSE` file.
