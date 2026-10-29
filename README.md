# Charlie MJ Reader

**Read Smarter. Learn Deeper. Build Your Knowledge.**

A local-first Chrome Manifest V3 extension for distraction-free article reading, article capture, highlights, notes, vocabulary, text-to-speech, library organization and portable backups.

> This repository is a functional foundation and first implementation. Some advanced items in the product blueprint (AI provider calls, true DOCX/PDF generation, semantic search, cloud sync, spaced repetition scheduling, knowledge graph, and official Medium account status) are integration milestones, not represented as completed features.

<p align="center">
  <a href="/downloads/Charlie-MJ-Reader-v1.1.3.zip">
    <img src="https://img.shields.io/badge/%E2%AC%87%20Download%20Chrome%20Extension%20v1.1.3-2ea44f?style=for-the-badge" alt="Charlie-MJ-Reader">
  </a>
</p>

## Quick start

1. Download and extract the ZIP.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this project folder.
5. Pin Charlie MJ Reader to the Chrome toolbar.
6. Open an ordinary article page and use the extension popup or floating toolbar.

The extension uses plain JavaScript ES modules and requires no build step.

## Current functional features

- Manifest V3 extension with popup and full-page workspace.
- Article capture from the active tab, title, URL, domain, author, image metadata, word count and estimated reading time where available.
- Local article library and reading history.
- Floating page toolbar with save, reader, highlight, listen and selected-word actions.
- Save selected text as a highlight using the context menu or toolbar.
- Text-to-speech using the browser Speech Synthesis API.
- Notes, vocabulary entries and collections.
- Search saved article titles and content.
- Markdown, TXT, HTML and JSON article exports.
- Full JSON backup and restore.
- Theme, reading, toolbar, website, AI consent and Medium reminder settings.
- Medium Access Manager with official membership link and safe reminder-only behavior.

## Project layout

```text
Charlie-MJ-Reader/
├── assets/                 # Logo, icons and project thumbnail
├── docs/                   # User, feature and developer documentation
├── src/
│   ├── background/         # MV3 service worker and context menus
│   ├── content/            # Page toolbar and page integration
│   ├── lib/                # Storage, extraction and export utilities
│   ├── options/            # Full settings center
│   ├── popup/              # Extension popup
│   └── reader/             # Full-page library and reader workspace
├── tests/                  # Manual QA checklist and test notes
├── manifest.json
└── README.md
```

## Permissions and privacy

- `activeTab` and `scripting` are used for user-initiated capture and reading actions.
- `storage` stores the library locally in Chrome extension storage.
- `tabs` opens the reader and reads the active tab for requested actions.
- `contextMenus` adds save-selection and save-page actions.
- `notifications` is reserved for user-enabled reminders.
- Optional HTTP/HTTPS host permissions allow future site-specific integrations. Ask users to grant only the websites they choose.
- AI configuration is opt-in. The current starter stores provider settings but does not transmit article content to an AI service.
- The extension does not manipulate cookies, bypass paywalls, or reset server-enforced reading quotas.

## Developer standards

- ES modules and small feature-focused files.
- JSDoc comments on core modules and non-obvious behavior.
- Consistent 2-space indentation, semicolons and descriptive names.
- No inline event handlers.
- UI content is escaped before being rendered as HTML.
- Keep new features in their own module rather than growing a single large script.

## Documentation

See [`docs/`](docs/README.md) for installation, feature status, architecture, privacy, roadmap and QA.

## License

MIT — see `LICENSE`.

## Smart Audio Reader

Click **Read** on a saved article to open the synchronized reader and start playback. The reader includes a media toolbar, progress, sentence/word highlighting, voice and speed controls, auto-scroll, focus mode, bookmarks, position notes, sleep timer, sentence navigation, keyboard shortcuts, and optional next-article playback. See `docs/SMART-AUDIO-READER.md` for platform limitations and details.


### Main-workspace Media Reader
Use the **Media Reader** item in the main sidebar to open the audio workspace. From My Library or the Reader workspace, click **Read** on an article: the application switches to Media Reader and displays the Smart Audio Media Toolbar above the article. The toolbar is part of the main workspace (not a browser-action popup). Close reading to return to the Media Reader landing view.


### Open the full media player from a webpage
On a supported article page, click the floating toolbar's **♫ Listen** or **▤ Reader** control. Charlie MJ Reader captures/reuses that article and opens the full Reader workspace directly on **Media Reader**, where the working media deck appears above the article. The deck includes playback, progress, speed, voice and synchronized highlighting controls.
