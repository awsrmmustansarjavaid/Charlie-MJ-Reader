# Charlie MJ Language Learning — v1.0.0

## Architecture

Language Learning is an additive workspace inside Charlie MJ Reader. It reuses the existing `articles` collection, website profiles, page-capture message, fetch engine, and shared `vocabulary` collection. Learning-specific records and preferences live under `languageLearning`; existing Reader records are not renamed or deleted.

## Added in this update

- A **Learning Language** tab in My Reading Library, filtered from the shared article database by explicit article or website learning metadata.
- Add Website dialog fields for website category, learning-site flag, and learning language.
- Language Learning tool navigation for articles, vocabulary, grammar, sentences, expressions, progress, and settings.
- Article masthead using available source logo/favicon, thumbnail, title, subtitle/description, author, author image, publication date, and source URL.
- Expanded grammar topic catalog: parts of speech, tenses, articles, cases, clauses, sentence structure, morphology, modals, conditionals, passive voice, reported speech, gerunds, infinitives, collocations, idioms, phrasal verbs, prefixes, suffixes, and punctuation.
- Per-category grammar colors and text treatment (normal, bold, italic, underline), plus reader font family, font size, and highlight appearance.
- Dedicated Language Learning Mode preferences in Settings, including target language, learner and target CEFR levels, daily goal, and revision-reminder preference.
- Learning dashboard places Learning Tools before Continue Learning and links grammar categories, Open Learning Articles, Shared Reader Vocabulary, and Review Vocabulary.
- Article refresh uses the existing Reader article fetch function.
- Language Learning exports JSON, CSV, and Markdown and imports JSON backups by merging learning records instead of replacing unrelated Reader data.
- Existing Productivity Reader retains its JSON backup import/export, article downloads, and vocabulary CSV/Markdown exports.
- Learning activity dates, article opens, saved learning records, and a simple consecutive-day streak are tracked locally.

## Accuracy and limitations

- The built-in grammar highlighter remains English-first and heuristic. The expanded grammar topic catalog provides controls and saved-learning categories; it does not mean a full NLP parser for every category is bundled.
- CEFR article difficulty is a heuristic estimate. The learner's CEFR level and target level are user-selected preferences, not certified assessments.
- Publication dates and author portraits are shown only when the page exposes usable metadata. Source logos use the article/site metadata or a favicon fallback.
- Revision reminders are stored as a preference; this release does not schedule operating-system notifications or implement spaced-repetition scheduling.
- Daily goal is a configurable target; measured study minutes require an active timing session and are not inferred from page-open duration.
- Translation still depends on the existing online translation service. Pronunciation uses browser/OS speech synthesis.

## Compatibility and safety

- Extension version remains `1.0.0`.
- Existing Productivity Reader, article storage, vocabulary storage, and supported-site activation rules remain in place.
- Learning Library views read the same article records rather than creating a second article database.
- Imported records are merged by stable IDs where available. Back up existing data before importing external backups.
