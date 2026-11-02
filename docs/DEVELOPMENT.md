# Architecture & Developer Guide

## Runtime surfaces
- **Popup:** quick actions and the Active / Sleeping status of the current tab.
- **Reader workspace:** full-page dashboard, library, reader and See Saved page.
- **Library:** My Reading Library workspace.
- **Options:** settings center, including Supported Websites.
- **Content script (`src/content/content.js`):** page toolbars, selection toolbar, focus, native reading.
- **Service worker (`src/background/service-worker.js`):** message handling, Freedium fetch, page-style injection, sleep badge, context menus.
- **Link context menu (`src/background/link-context-menu.js`):** right-click on links, loaded with `importScripts`.

## Activation architecture
```text
page loads → content.js (tiny gate) → Supported Websites says "run"? 
      no  → sleep: nothing initialised, only a storage listener remains
      yes → create engine → request page styles → build toolbar → features
```
- `src/lib/site-gate.js` is the single source of truth. It is a classic script shared by the content script, the service worker (`importScripts`), the popup and the options page. `CMJSiteGate.evaluate(settings, url)` returns the matching profile, merged with feature defaults, or none.
- A profile matches by domain (subdomains optional), then `excludedPaths` and `includedPaths`. The Freedium mirror is evaluated as the Medium URL it mirrors.
- The content script owns an **engine** object created only for active pages. `engine.stop()` removes every event listener, observer, timer, speech utterance, injected element, class, CSS variable and the page styles. The same path runs when a site is removed, disabled, excluded, or when the extension is reloaded (calls guarded against "context invalidated").
- The service worker re-checks the sender: messages from a web page are rejected unless that page is supported. Extension pages are unaffected.
- Page styles (`content.css`) are not declared in the manifest; they are added through `chrome.scripting.insertCSS` only after the gate passes and removed on sleep.
- Settings are written as small patches (`patchSettings`), never by rewriting a stale full copy.

## Per-site profile fields
`domain`, `enabled`, `includeSubdomains`, `includedPaths`, `excludedPaths`, and feature switches `toolbar`, `selectionToolbar`, `vocabulary`, `media`, `focus`, `productivity`, `nativeReading`, `readingTracking`, `autoScroll`, `articleDetection`. Missing switches default to ON (`CMJSiteGate.FEATURE_DEFAULTS`).

## Data model
A single local store with arrays `articles`, `highlights`, `notes`, `vocabulary`, `quotes`, `paragraphs`, `selections`, `bookmarks`, `collections`, `readingHistory`, plus `settings`, `readingLibrary` and `adapterPackages`. Every saved record has a stable `id`, a timestamp and source metadata (`url`, `title`, `domain`) where applicable.

## Coding conventions
- ES modules for extension pages; classic scripts only where the context requires it (content script, service worker imports, site gate).
- One responsibility per module; `camelCase` for functions and variables.
- 2 spaces, semicolons.
- JSDoc for public helpers and for security-sensitive behaviour.
- Never place untrusted page text into HTML without escaping.
- Never expose API keys or article bodies in diagnostics or error messages.
- Anything that touches a web page must pass the gate first.

## Adding a feature switch for websites
1. Add the key to `FEATURE_DEFAULTS` in `src/lib/site-gate.js`.
2. Read it from the active profile (`site.<key> !== false`) in `content.js`.
3. Add it to the `FEATS` list in `src/options/options.js` and to the profile defaults there.

## Adding an AI provider
1. Implement a provider adapter in `src/lib/ai/`.
2. Require explicit user consent before sending article text.
3. Show the provider, endpoint and the data being sent.
4. Never ship a production API secret in a public extension; use a user-supplied key or a secure backend.
5. Handle timeouts, rate limits, provider errors and deletion requests.

## Testing
Run the manual checklist in `tests/QA-CHECKLIST.md`. Automated browser tests should cover the activation gate (supported, unsupported, disabled, path-excluded, Freedium), live wake / sleep, toolbar button behaviour and extension-reload handling. Add unit tests for extraction, storage migrations, search and export serializers before a store release.

## Supplied embedded-player CSS
The layout snippet from the project request is kept at [`snippets/ytp-embed-layout.css`](snippets/ytp-embed-layout.css). It is an optional integration stylesheet for a host panel that embeds a YouTube player and is not required by the core extension.


## Source code style

All new and modified application logic should use readable multi-line formatting, four-space indentation, descriptive identifiers, and JSDoc-style comments for exported functions and non-obvious workflows. Avoid minified one-line functions in source files. Keep HTML semantic and accessible, group CSS by component with section comments, and validate JavaScript syntax before packaging.

The Language Learning module must continue to use the shared `articles` and `vocabulary` collections. Do not introduce a parallel article store or duplicate vocabulary records.
