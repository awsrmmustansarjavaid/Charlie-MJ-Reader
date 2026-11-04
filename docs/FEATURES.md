# Feature Matrix

This matrix describes the shipped Charlie MJ Reader v1.0.0 implementation. “Implemented” means the workflow is present in this release. “Partial / best-effort” identifies behavior that depends on websites, browser APIs or external services. Configuration-only and preparation features are not presented as completed product functionality.

## Website activation and page controls

| Feature | Status | Scope / notes |
|---|---|---|
| Supported Websites master gate | Implemented | Page features run only for enabled websites in the allowlist |
| Sleep mode | Implemented | Unsupported, disabled or path-excluded pages remain untouched by page-reading features |
| Live wake / sleep | Implemented | Open tabs react to Supported Websites changes and clean up page UI |
| Subdomain rules | Implemented | Per-site option to include subdomains |
| Path restrictions | Implemented | Include-only and excluded path rules |
| Test a page | Implemented | Evaluates a URL against the active site rules |
| Per-site feature switches | Implemented | Toolbar, selection, vocabulary, media, focus, productivity, native reading, tracking, auto-scroll and article detection |
| Popup status and icon badge | Implemented | Active / Sleeping status and grey `zzz` indicator |

## Toolbars and reading

| Feature | Status | Scope / notes |
|---|---|---|
| Main floating toolbar | Implemented | Workspace, vocabulary, productivity reader, focus and productivity entry points |
| Selection toolbar | Implemented | Translate, meaning, vocabulary, quote, paragraph, selection, copy, notes and pronunciation actions |
| Media toolbar | Implemented | Listening and playback-related controls |
| Productivity toolbar | Implemented | Focus, appearance, timers and native reading |
| Toolbar layouts | Implemented | Floating, navbar, sidebar, right-sidebar, bottom-navbar and bubble |
| Toolbar appearance | Implemented | Position, opacity, themes and site overrides |
| Article capture | Implemented | Captures title, URL and available metadata/content |
| Reader Workspace | Implemented | Sanitized article content, table of contents, themes and typography controls |
| Reading progress | Implemented | Progress and reading position stored with article records |
| Mouse-follow reading focus | Available | Best-effort focus behavior in the saved-article reader |
| Article extraction | Partial | Quality and metadata depend on the source site's markup and accessibility |

## Audio and saved knowledge

| Feature | Status | Scope / notes |
|---|---|---|
| Browser text-to-speech | Implemented | Uses voices provided by browser / operating system |
| Playback controls | Implemented | Play, pause, resume, stop and sentence navigation |
| Speech highlighting | Implemented | Word, sentence or combined mode |
| Word timing | Partial | Native word-boundary events vary; estimated fallback is approximate |
| Auto-scroll and focus | Implemented | Reader workspace controls |
| Sleep timer, bookmark and note-at-position | Implemented | Stored against article reading position |
| Repeat word / next article | Implemented | Reader playback options |
| Highlights, quotes and paragraphs | Implemented | Source-linked saved records |
| Custom selections and notes | Implemented | Stored with available source metadata |
| Reading history and analytics | Implemented | Local history and available reading metrics |
| Collections and bookmarks | Implemented | Organize and resume saved reading |

## Vocabulary and Language Learning

| Feature | Status | Scope / notes |
|---|---|---|
| Vocabulary records | Implemented | Translation, definition, examples, pronunciation, part of speech, synonyms, tags and notes |
| Nested vocabulary categories | Implemented | Categories and subcategories |
| Mastered state and revision quiz | Implemented | Basic review workflow; not adaptive spaced repetition |
| Vocabulary export | Implemented | Markdown, CSV and JSON |
| Translation | Implemented | MyMemory request on explicit user action; selected text only |
| Dictionary lookup | Implemented | Public dictionary endpoint on request |
| Language Learning workspace | Implemented | Uses shared article and vocabulary records |
| Learning articles and website metadata | Implemented | Learning flags and language metadata |
| Grammar highlighting | Partial | Lightweight heuristic; English-first, not a complete parser |
| CEFR preferences | Implemented | User-selected learner and target levels |
| Estimated article difficulty | Partial | Heuristic estimate, not certified assessment |
| Learning export / import | Implemented | JSON export and merge-oriented JSON import |
| Scheduled reminders | Not included | Preference storage does not schedule OS notifications |

## My Reading Library and research

| Feature | Status | Scope / notes |
|---|---|---|
| Website and publication library | Implemented | Organize websites, newspapers and profile pages |
| Categories, tags and favorites | Implemented | Organize library records |
| Website details | Implemented | Available overview, latest articles, saved articles and raw record data |
| SEO checks | Implemented | 14-check on-page score |
| Tranco ranking | Implemented | Rank and trend when data is available |
| PageSpeed / Lighthouse | Implemented | Public performance data when available |
| Article audits | Implemented | Per-article audit workflow |
| robots.txt / sitemap detection | Implemented | Public endpoint checks |
| Google `site:` shortcuts | Implemented | Search shortcuts |
| Article Library | Implemented | Search, refresh/fetch, details, edit, remove and import/export |
| Duplicate-aware saving | Implemented | Same article is not intended to create a second record |

## Productivity, exports and compatibility

| Feature | Status | Scope / notes |
|---|---|---|
| Focus appearance | Implemented | Brightness, contrast, opacity, dimming, blur, warmth and font scale |
| Day / Night / Auto | Implemented | Appearance modes |
| Image hiding | Implemented | Optional large-image hiding |
| Ad hiding | Partial | Best-effort; not a full ad blocker |
| Native reading | Implemented | Word-by-word page highlighting with configurable timing |
| Pomodoro / 80-20 timers | Implemented | Configurable productivity timers |
| Toast notifications | Implemented | Position, duration and per-event controls |
| Article exports | Implemented | Markdown, TXT, HTML and JSON |
| Full JSON backup / restore | Implemented | Validated backup workflow |
| Database ZIP | Implemented | Portable database export |
| GitHub Data Sync | Preparation | Difference ZIP and manual folder write; no automatic push/pull |
| Medium / Freedium | Implemented | Configurable mirror hand-off and article extraction |
| Adapter package import | Implemented | Validated ZIP package stored as data; imported JS is not executed |

## Not included in this release

- AI summaries, article Q&A and flashcards. AI configuration is not an active AI workflow.
- Semantic search, knowledge graph or remote cloud account/synchronization.
- Automatic GitHub push or pull.
- Adaptive spaced repetition and scheduled operating-system reminders.
- True PDF or DOCX generation.
- Official Medium account, membership or quota status; no paywall or authentication bypass.
