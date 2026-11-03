/**
 * @file Data-driven analyzer: adds a language by supplying a JSON "pack".
 *
 * A pack lists closed-class words (pronouns, conjunctions, ...) and optional
 * suffix rules. No code is needed to support a new language: drop a pack into
 * `packs/` and register it in `packs/index.js`.
 *
 * Pack format:
 *   {
 *     "language": "es",
 *     "name": "Spanish",
 *     "closedClass": { "pronoun": ["yo", "tú"], "article": ["el", "la"], ... },
 *     "details": { "yo": [["Person", "1st singular"]] },
 *     "suffixRules": [{ "suffix": "mente", "category": "adverb", "label": "-mente forms adverbs", "minStem": 3 }]
 *   }
 */

/** Confidence assigned to an exact closed-class match. */
const CLOSED_CLASS_CONFIDENCE = 0.95;

/** Confidence assigned to a suffix-rule guess. */
const SUFFIX_CONFIDENCE = 0.55;

/**
 * Build an analyzer from a language pack.
 * @param {object} pack Language pack (see file header).
 * @returns {{id: string, name: string, tier: string, languages: string[], analyze: Function}} Analyzer.
 */
export function createLexiconAnalyzer(pack) {
    // Index closed-class words once for O(1) lookups.
    const index = new Map();
    for (const [category, words] of Object.entries(pack.closedClass || {})) {
        for (const word of words) if (!index.has(word)) index.set(word, category);
    }
    const extraDetails = pack.details || {};

    return {
        id: `lexicon-${pack.language}`,
        name: `${pack.name} rule-based analyzer`,
        tier: "language-specific",
        languages: [pack.language],

        /**
         * @param {string} word Normalised, lower-cased word.
         * @returns {Promise<object|null>} Partial grammar result.
         */
        async analyze(word) {
            const lower = word.toLocaleLowerCase(pack.language);
            const category = index.get(lower);
            if (category) {
                return {
                    category,
                    confidence: CLOSED_CLASS_CONFIDENCE,
                    details: [["Word class", "closed-class (function) word"], ...(extraDetails[lower] || [])]
                };
            }
            for (const rule of pack.suffixRules || []) {
                if (lower.endsWith(rule.suffix) && lower.length - rule.suffix.length >= (rule.minStem ?? 3)) {
                    return {
                        category: rule.category,
                        confidence: SUFFIX_CONFIDENCE,
                        details: [["Suffix", `-${rule.suffix}`], ["Note", rule.label], ["Basis", "suffix pattern (not verified in a dictionary)"]]
                    };
                }
            }
            return null;
        }
    };
}
