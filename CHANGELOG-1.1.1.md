# Charlie MJ Reader 1.1.1

## Full Medium/Freedium article capture fix

- Expanded Reader capture selectors for article/body containers.
- Added Freedium-specific extraction handling.
- Automatically expands `Show all … sections` before capture when present.
- Prefers the full Freedium `<main>` content when it contains a complete article.
- Removes navigation/header/footer controls from the saved snapshot while preserving headings, paragraphs, lists, quotes, code and images.
- Keeps imported adapter JavaScript inactive; the built-in host-controlled extractor is responsible for actual page capture.
