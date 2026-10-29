# Build update — 2026-10-26

- Preserved Manifest V3 extension version `1.0.0` as requested.
- Fixed the malformed `chrome.scripting.executeScript` closure in `captureActive()`.
- Added settings sections for Knowledge Intelligence, Topics & Knowledge, Productivity, Performance, Database Manager and GitHub Data Sync preparation.
- Expanded Supported Websites management with JSON import/export, edit, remove and profile validation.
- Added Medium adapter package import/export and validation. Imported JavaScript is stored as inactive source data and is not automatically executed.
- Added topic records that link article IDs without duplicating article content.
- Added a portable database layout and website profile index.

## Limitations

This is an enhanced source package, not a claim that every proposed capability is complete. Semantic embeddings, real GitHub pull/push/remote diff, persistent filesystem directory handles, per-record live JSON storage, robust word-level synchronized highlighting and full cross-site ad blocking require further implementation and browser testing. Medium paywall or server-side quota circumvention is not provided.

## 2026-10-26 — Reader import fix

- Fixed the `#import-file` null `addEventListener` error by delegating the file input change handler to `document`. The input is created dynamically by the Library/History view, so it may not exist when the reader module first executes.
- Added backup-object validation, compatibility defaults for missing collections, and a clear import success/error message.

## Smart Audio Reader enhancement

- Clicking **Read** opens the saved-article reader and automatically starts speech.
- Added persistent media controls for play/resume, pause, stop, previous/next sentence, progress, word count, and percentage.
- Added word/sentence/combined highlight modes, active-word emphasis, auto-scroll, focus mode, voice selection, speed, smart sentence pause, sleep timer, bookmark-at-position, note-at-position, repeat-word, keyboard shortcuts, and optional next-article playback.
- Added a dedicated Smart Audio Reader settings tab for defaults.
- Added documentation at `docs/SMART-AUDIO-READER.md`.
- Word-level synchronization uses speech boundary events where available and estimated per-word timing as a fallback; fallback timing is approximate.
- Added a Reading Analytics view, click-to-lookup vocabulary capture through the dictionary API, and optional personal completion-record export.


## 21:32 PKT — Main-workspace Media Reader tab
- Added a dedicated **Media Reader** tab to the main application sidebar.
- Clicking **Read** now opens the active article and Smart Audio Media Toolbar in the main workspace, with the Media Reader tab selected.
- Added a Media Reader landing state with quick access to saved articles when no article is active.
- Closing reading returns to the Media Reader tab; navigating away from it ends the active reading session.


## 21:25 PKT — Main-workspace media launch fix
- Fixed the Medium page floating toolbar's Listen and Reader actions: both now capture the current article and open the full Reader workspace directly on its Media Reader screen.
- The selected article is stored/reused by URL and passed into the workspace through an article ID deep link.
- The main workspace now auto-starts the real reader session and shows the working Play/Pause/Stop, progress, speed, voice, highlighting and reading controls above the article.
- Reworked the media deck styling to make it visually prominent and responsive.
- Kept the existing article/library and other extension features intact.


## 2026-10-27 — Runtime error and dialog reliability fix
- Initialized the sentence word-timing fallback index before its interval runs, preventing `fallbackWord is not defined`.
- Replaced native `window.confirm()` prompts in the Reader and Settings topic removal flow with extension-owned confirmation dialogs. This avoids Chrome suppressing native dialogs when the extension page is not the active tab.
- Added accessible dialog styling and kept the existing reader workflows intact.


## Vocabulary Studio expansion — 2026-10-28 (version remains 1.0.0)
- Added selection-triggered toolbar for enabled sites, defaulting to Ekşi Sözlük and X/Twitter.
- Added custom domain allowlist and enable/disable controls in Settings → Vocabulary.
- Added configurable source/target languages and explicit-click translation using the public MyMemory endpoint.
- Added vocabulary fields, source context, hierarchical category headings/subheadings, search, editing, copying, mastery status and revision scheduling.
- Added Markdown, CSV and JSON vocabulary exports.
- Preserved the existing extension manifest version (1.0.0) and existing Reader features.

## 2026-10-28 — Toolbar, Focus, Productivity and Adapter Package expansion

- Renamed Floating Toolbar settings to Toolbars.
- Added site allow-list gating for all on-page toolbars.
- Added Media, Vocabulary, Focus and Productivity toolbar modules.
- Added Focus controls: ad hiding, day/night, brightness, contrast, opacity, blur, warmth and font scale.
- Added 80/20 and Pomodoro toolbar timers.
- Added Compatibility Adapter ZIP import, validation, enable/disable and logical adapter storage.
- Added Adapter Package How to Use guide.
- Kept extension version at 1.0.0.

## 2026-10-28 — v1.0.0 feature-preserving upgrade
- Restored the main on-page toolbar and expanded its settings.
- Added independent themes for Main, Media, Vocabulary and Productivity toolbars.
- Added Media Play/Pause/Stop plus progress feedback and Media Reader launch.
- Added Copy / Save / See Translate vocabulary actions.
- Added Focus, Day/Night, Pomodoro and 80/20 controls to the productivity/focus toolset.
- Added supported-website grid/card settings.
- Improved full-article extraction for Reader and Smart Audio.
- Added native-page reading timer/highlighting support on supported sites.
- Added dedicated My Reading Library page with categories, search suggestions, import/export, website metadata refresh and per-category JSON export.
- Preserved Compatibility Adapter Package Manager with JSON/ZIP import, validation, enable/disable/delete and inactive JavaScript storage.
- Version remains 1.0.0.

## 2026-10-28 — FINAL v1.0.0 maintenance build
- Fixed My Reading Library actions and rebuilt the page around a functional sidebar navigation model.
- Added Website, Favorite, Profile Pages, Category, Tags, Recent and All Saved library views.
- Added working website profile controls directly inside My Reading Library cards.
- Added automatic synchronization from Library website additions into Supported Websites.
- Added per-site toolbar type and individual Main/Media/Vocabulary/Productivity toolbar themes.
- Added navbar, sidebar, right-sidebar, bottom-navbar and bubble toolbar types while retaining floating mode.
- Hardened main toolbar visibility so an enabled supported website explicitly renders the toolbar.
- Improved native reading timing/highlighting and configurable colors.
- Improved article extraction and website metadata capture.
- Expanded Medium Compatibility with dedicated settings sections and preserved the adapter package manager.
- Version remains 1.0.0.


## v1.1.3 — Full Freedium fetch extraction
- Added background fetch of the public Freedium HTML for Medium/Freedium article capture.
- Medium capture no longer depends on the limited Medium DOM preview.
- Freedium complete-article extraction now scores for all sections, conclusion, and long-form content.
- Reader and popup capture paths use the same content-script extraction pipeline.
