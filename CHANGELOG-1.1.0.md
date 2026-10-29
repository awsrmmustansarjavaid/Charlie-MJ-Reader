# Charlie MJ Reader 1.1.0

## Reader
- Added Read Yourself as the primary saved-article action.
- Captures semantic article HTML separately from the reader interface.
- Preserves headings, paragraphs, lists, quotes, tables, code, links, images and captions where available.
- Added featured image, author, publication date, description and smart table of contents.
- Added persistent font size, reading width and line-height controls.
- Added Dark, Light and Sepia reading themes.
- Added Mouse Follow line/word focus.
- Added smooth audio synchronization with existing word progress and auto-scroll.
- Markdown and HTML exports now use preserved article structure when available.

## Medium
- Consolidated Compatibility Adapters into Medium Compatibility.
- Added Medium detection and optional Freedium opening controls.
- Added configurable Freedium endpoint and new-tab behavior.
- Preserved fallback extraction and metadata/image controls.

## Adapter Packages
- Added complete ZIP adapter package import.
- Added package validation, size limits, safe-path checks, executable extension blocking and manifest validation.
- Added install confirmation, replacement confirmation and enable/disable controls.
- Added Details, Export and Delete controls.
- Packages are stored under the logical `extensions/adapters/<adapter-id>/` namespace in extension storage.
- Imported JavaScript remains inactive package data.

## Existing functionality
- Existing JSON adapter import remains supported.
- Existing local-first storage and backup behavior remains intact.
