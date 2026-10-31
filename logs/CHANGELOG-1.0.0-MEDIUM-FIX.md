# Charlie MJ Reader 1.0.0 — Medium compatibility repair

- Removed article-specific phrase scoring and rejection from Medium/Freedium article extraction.
- Fetched article content is no longer rejected because it lacks headings or phrases from an unrelated story.
- Added the missing ZIP adapter package reader used by both adapter ZIP import controls.
- Validates package paths, semantic version, entry file, compression, file count and expanded size before installation.
- Catches the toolbar Reader Workspace error after an extension reload and displays a refresh instruction instead of an unhandled promise rejection.
- Preserved the existing reader, library, saved items, productivity, settings and other extension features.
