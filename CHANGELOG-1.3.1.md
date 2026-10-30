# Charlie MJ Reader v1.3.1

## CSP / third-party HTML parsing fix
- Hardened `parseHtml()` against third-party SVG/HTML inline event-handler attributes such as `onclick` and `onload`.
- Strips `javascript:` URL schemes before parsing fetched pages.
- Adds a second DOM-level sanitization pass for executable event attributes.
- Preserves JSON-LD structured data used for site/article metadata.

This prevents third-party page markup from being interpreted as inline executable handlers inside the extension page's strict Manifest V3 CSP.
