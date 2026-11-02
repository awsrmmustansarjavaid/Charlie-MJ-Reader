# Code quality and feature notes

## Language Learning toolbar flow

The content-script toolbar captures the active article and sends it to the service worker. The service worker upserts the article by canonical URL, marks it for Language Learning, and opens the Language Learning page with the saved article ID. The page resolves that ID against the shared article store and opens the reader directly.

## Shared article header

`src/lib/article-header.js` is the shared Article Header Component used by Productivity Reader and Language Learning Mode. Both reader stylesheets provide the same cardless grid treatment. Author/byline widgets are removed from extracted article markup when they are clearly publisher profile blocks, avoiding a second messy author panel inside the article body.

## Central data

Language and font registries live in `src/database/`. ISO catalogue entries should not be confused with supported translation service languages or a claim that all entries are currently spoken modern languages. Font stacks are recommendations; actual installed fonts vary by device.

## Safety and data integrity

- Article upsert uses canonical URL matching to avoid duplicates.
- Existing article IDs, saved timestamps, reading status, and progress are preserved when refreshing metadata.
- Untrusted article metadata is escaped before insertion into the shared header.
- External source and image URLs are restricted to HTTP(S).
