# Version 1.1.2

- Fixed Productivity Reader startup so opening an article does not automatically start audio playback.
- Fixed structured-HTML audio sentence indexing; Listen no longer treats an empty sentence queue as a completed article.
- Completion confirmation/certificate flow is now guarded so it only runs once after a real audio session reaches the end.
- Hardened article HTML sanitization by stripping SVG/MathML blocks and inline event-handler attributes before parsing, in addition to rebuilding only allowlisted HTML elements and attributes.
- Kept the strict extension CSP; no `unsafe-inline` permission was added.
