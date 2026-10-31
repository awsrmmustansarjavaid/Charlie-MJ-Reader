# Version 1.1.4 — Reliable button feedback and article-scoped saved library

- Fixed the reader toast host styling: notifications were being created with `id="cmj-toast-host"` while the stylesheet targeted a class selector, so the toast host could remain unpositioned/invisible. The ID now has explicit fixed positioning for all four configured corners.
- Kept bottom-right as the default notification location and retained the Notification settings event toggle for generic button-click feedback.
- Extended button-click feedback to the standalone See Saved page and the separate library workspace, respecting global notifications and the `action` event setting.
- Added a See Saved action to each Article Library card. It opens the dedicated Saved Library HTML page filtered to that article, grouping paragraphs/lines, words, quotes, highlights, notes, bookmarks and custom selections under separate headings.
- Removed the redundant Saved Paragraphs sidebar navigation entry; saved paragraphs remain visible in See Saved.
- Confirmed the Productivity Reader has only one note action: “Add note at position”.

## Validation
- All JavaScript files passed `node --check`.
- ZIP integrity check passed.
- Chrome UI interaction testing has not been performed in this environment.
