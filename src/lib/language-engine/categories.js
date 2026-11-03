/**
 * @file Universal grammatical categories used by every language analyzer.
 *
 * Analyzers return these canonical identifiers regardless of the language's
 * own terminology, so the UI, colours and statistics work for any language.
 * The first block matches the grammar types already used by the Language
 * Learning Reader; the second block adds categories needed by other languages.
 */

/** Canonical category identifiers mapped to their display labels. */
export const CATEGORY_LABELS = Object.freeze({
    noun: "Noun",
    verb: "Verb",
    pronoun: "Pronoun",
    adjective: "Adjective",
    adverb: "Adverb",
    conjunction: "Conjunction",
    preposition: "Preposition / postposition",
    article: "Article",
    determiner: "Determiner",
    suffix: "Suffix",
    prefix: "Prefix",
    // Categories beyond the Language Learning Reader's highlight set.
    "proper-noun": "Proper noun",
    numeral: "Numeral",
    particle: "Particle",
    interjection: "Interjection",
    "auxiliary-verb": "Auxiliary verb",
    classifier: "Classifier",
    unknown: "Unknown"
});

/**
 * Map a part-of-speech label from an external source (Wiktionary, dictionaries)
 * to a canonical category.
 * @param {string} label Source label such as "Noun", "Postposition", "Proper noun".
 * @returns {string} Canonical category identifier, or "unknown".
 */
export function categoryFromLabel(label) {
    const text = String(label || "").trim().toLocaleLowerCase();
    if (!text) return "unknown";
    const rules = [
        [/^proper noun/, "proper-noun"],
        [/^(noun|substantive)/, "noun"],
        [/^(auxiliary|modal)/, "auxiliary-verb"],
        [/adverb/, "adverb"],
        [/\bverb|participle|gerund/, "verb"],
        [/pronoun/, "pronoun"],
        [/adjective|adjectival/, "adjective"],
        [/conjunction|connective/, "conjunction"],
        [/preposition|postposition|circumposition|adposition/, "preposition"],
        [/^article/, "article"],
        [/determiner|quantifier/, "determiner"],
        [/numeral|number|cardinal|ordinal/, "numeral"],
        [/particle/, "particle"],
        [/interjection|exclamation/, "interjection"],
        [/classifier|counter/, "classifier"],
        [/^suffix|^enclitic|^affix/, "suffix"],
        [/^prefix|^proclitic/, "prefix"]
    ];
    for (const [pattern, category] of rules) if (pattern.test(text)) return category;
    return "unknown";
}

/**
 * Return the display label for a canonical category.
 * @param {string} category Canonical category.
 * @returns {string} Human readable label.
 */
export function categoryLabel(category) {
    return CATEGORY_LABELS[category] || CATEGORY_LABELS.unknown;
}
