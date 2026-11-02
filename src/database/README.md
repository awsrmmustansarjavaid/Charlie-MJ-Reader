# Centralized language and font databases

- `languages.json` contains the bundled ISO 639 language registry (7,910 records). The catalogue includes historic and constructed identifiers as well as currently used languages; provider translation support is independent.
- `fonts.json` contains primary language-specific font stacks.
- `font-catalog.json` contains curated script stacks used by the Language Learning selector.
- `font-registry.json` consolidates primary and script-fallback recommendations.

Browsers cannot enumerate every installed font in a portable extension. Font families listed here are recommendations and fallback chains; actual rendering depends on the operating system and installed fonts.
