# Language engine

`src/lib/language-engine/` is the single place where words are analysed. The UI
(`hover-grammar.js`) only calls `engine.analyze(word, context)`.

## Pipeline

1. **Identify the language** (`detect.js`): script, language-specific letters,
   stop-word voting, then the article's language hint.
2. **Run every analyzer registered for that language** (`engine.js`).
3. **Merge** category, meaning, lemma and grammatical details into one result.

## Coverage tiers (always shown to the reader)

| Tier | Source | Languages |
| --- | --- | --- |
| language-specific | rule-based, offline | Turkish (full morphology), English, Spanish, French, German, Urdu, Arabic (function words + suffix rules) |
| dictionary | Wiktionary / Free Dictionary API / MyMemory, online | any language with a Wiktionary entry |
| heuristic | script and capitalisation | every language in the ISO 639 registry (7,910 entries) |

## Adding a language without touching the engine

**Option A, data only:** copy `packs/es.json` to `packs/<code>.json`, fill in the
closed-class words and suffix rules, and add `"<code>"` to `PACK_FILES` in
`packs/index.js`.

**Option B, custom code:** write an object with `id`, `name`, `tier`,
`languages` (array of codes or `"*"`) and `async analyze(word, context)`, then
call `engine.register(analyzer)` (see `analyzers/turkish.js`).

An analyzer returns `{ category, confidence, meaning?, lemma?, details?: [[label, value]] }`
or `null`. Categories come from `categories.js`.
