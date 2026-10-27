# Charlie MJ Reader database layout

This directory documents the portable database layout. The current extension runtime stores active records in `chrome.storage.local`; it does not yet write one file per record directly into the installed extension directory. Use Settings → Database to export a portable snapshot.

Planned file layout:

- `articles/<category>/<article-id>.json`
- `highlights/<highlight-id>.json`
- `notes/<note-id>.json`
- `quotes/<quote-id>.json`
- `vocabulary/<vocabulary-id>.json`
- `topics/<topic-id>.json`
- `websites/<hostname>.json`
- `sync/manifest.json`
- `backups/`

Every record should carry `id`, `schemaVersion`, `createdAt`, and `updatedAt`. Topic/article relationships should use IDs, not duplicate article bodies.
