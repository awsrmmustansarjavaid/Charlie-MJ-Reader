# Database resources

The extension uses `chrome.storage.local` for live user records. JSON files in this directory are bundled registries and documented import/export shapes, not writable runtime databases.

- `languages.json`: ISO 639 language identifiers bundled for language selectors.
- `font-catalog.json`: script-aware preferred font stacks; availability depends on installed operating-system fonts.
- `bookmarks.json`: bookmark backup schema. Live bookmarks are stored in the shared `data.bookmarks` collection and can be exported as JSON.

The browser extension cannot write into its own packaged extension directory at runtime. Exported backups are downloaded by the user instead.
