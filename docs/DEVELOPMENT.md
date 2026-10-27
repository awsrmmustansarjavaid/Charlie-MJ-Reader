# Architecture & Developer Guide

## Runtime surfaces
- **Popup:** small quick-action panel.
- **Reader workspace:** full-page dashboard and local library.
- **Options:** settings center.
- **Content script:** injects the floating toolbar into HTTP/HTTPS pages.
- **Service worker:** context menus, notifications and persistence messages.

## Data model
The local store is a single versioned object with arrays:
`articles`, `highlights`, `notes`, `vocabulary`, `bookmarks`, `collections`, `readingHistory`, `deleted`, plus `settings`.

Every saved record should have a stable `id`, a timestamp, and source metadata (`url`, `title`, `domain`) whenever applicable.

## Coding conventions
- Use ES modules.
- Prefer one responsibility per module.
- Use `camelCase` for variables/functions and `PascalCase` for classes.
- Use 2 spaces, semicolons and trailing commas in multiline objects.
- Add JSDoc for public helpers and explain security-sensitive behavior.
- Keep selectors and storage keys centralized as the project grows.
- Never interpolate untrusted page text into HTML without escaping it.
- Do not log API keys or article bodies.

## Adding an AI provider
1. Implement a provider adapter in `src/lib/ai/`.
2. Require explicit user consent before transmitting article text.
3. Show the provider, endpoint and data being sent.
4. Never expose a production API secret in a public extension package. Prefer a user-supplied key or a secure backend.
5. Handle timeouts, rate limits, provider errors and deletion requests.

## Testing
The current release has a manual QA checklist in `tests/QA-CHECKLIST.md`. Add unit tests for extraction, storage migrations, search and export serializers before shipping a store release.

## Supplied embedded-player CSS

The layout snippet from the project request is preserved at [`snippets/ytp-embed-layout.css`](snippets/ytp-embed-layout.css). It is an optional integration stylesheet for a host panel that embeds a YouTube player; it is not required by the core reader extension.
