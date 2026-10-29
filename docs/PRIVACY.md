# Privacy, Permissions & Security

Charlie MJ Reader is designed local-first.

## Data handling
- Saved articles, notes, highlights, vocabulary and settings are stored in Chrome extension local storage.
- No account or remote database is included in this starter package.
- Exported files are created locally in the browser.
- AI settings are configuration only; this build does not send article text to an AI endpoint.

## Permissions
- `activeTab`, `scripting`: user-triggered capture and speech actions on the active tab.
- `storage`: local library and settings.
- `tabs`: opening the workspace and querying the active tab.
- `contextMenus`: save selected text or page.
- `notifications`: future reminders.
- Optional HTTP/HTTPS host permissions are requested only when the extension needs site access.

## Important boundaries
- Only process content visible and accessible to the user.
- Do not bypass paywalls, subscription checks, authentication or server-side reading quotas.
- Medium Access Manager is a reminder and official-link feature; it cannot reset a server-enforced limit.
- Treat article text and page metadata as untrusted input.
- Keep API keys private. A key embedded in a distributed extension can be extracted by users or attackers.


### Vocabulary translation
The selection toolbar is local and appears only on enabled hostnames. When the user explicitly clicks Translate, selected text is sent to the public MyMemory translation endpoint (`api.mymemory.translated.net`) using the configured source and target language pair. Translation availability, retention and rate limits are controlled by that external service, not by this extension. Do not send confidential or sensitive text. Saving vocabulary without translation remains local.
