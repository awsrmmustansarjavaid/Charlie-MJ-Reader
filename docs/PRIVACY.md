# Privacy, Permissions & Security

Charlie MJ Reader is local-first.

## Where it runs
The extension acts only on websites in **Settings → Supported Websites**. On every other website it is asleep: it adds no interface or styles, observes nothing, tracks nothing and stores nothing. On such pages the page script only reads your supported-site list from local storage and stops. Requests that come from a web page are accepted by the background worker only when the page is a supported website.

## Data handling
- Articles, notes, highlights, quotes, vocabulary, bookmarks and settings are stored in Chrome extension local storage on your computer.
- There is no account and no remote database. Exports and backups are created locally in the browser.
- AI settings are configuration only; the extension does not send article text to any AI service.

## Network use
- **Translation:** when you press Translate, only the selected text (up to 1,800 characters) is sent to `api.mymemory.translated.net`.
- **Dictionary:** word lookups use `api.dictionaryapi.dev` on request.
- **Medium:** article pages are fetched through the configured Freedium mirror over HTTPS.
- **Library data:** adding or refreshing a website fetches that website and public ranking / PageSpeed data on request.

## Permissions
- `storage`, `unlimitedStorage`: local library and settings.
- `activeTab`, `scripting`, `tabs`: user-initiated capture, adding page styles on supported sites, opening the workspace.
- `contextMenus`: save page / selection and the link menu.
- `notifications`: short confirmations.
- Host access to `http://*/*` and `https://*/*`: required so the page script can exist; it does nothing outside Supported Websites. Also used for library fetching and the Freedium mirror.

## Security
- Fetched third-party HTML is stripped of inline event handlers and `javascript:` URLs; article HTML is rebuilt from an allow-list of tags and attributes. The strict extension content security policy is kept.
- UI text from pages is escaped before it is rendered.
- Imported adapter packages are validated and stored as data; their JavaScript is never executed.

## Boundaries
- Only content visible and accessible to you is processed.
- No bypassing of paywalls, subscription checks, authentication or server-side quotas.
- Treat article text and page metadata as untrusted input.
- Keep API keys private; a key shipped inside an extension can be extracted.
