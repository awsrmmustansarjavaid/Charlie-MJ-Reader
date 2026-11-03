/**
 * @file ISO 639 language registry access (7,900+ languages).
 *
 * The registry is the single source of truth for language names. Analyzers
 * and the detector refer to languages by code only; names are resolved here.
 */

/** Common English language names mapped to ISO codes, for article metadata written as names. */
const NAME_ALIASES = Object.freeze({
    turkish: "tr", english: "en", urdu: "ur", arabic: "ar", spanish: "es", french: "fr",
    german: "de", persian: "fa", farsi: "fa", russian: "ru", hindi: "hi", italian: "it", portuguese: "pt"
});

/** @type {Promise<LanguageRegistry>|null} Cached registry promise. */
let registryPromise = null;

/** Lookup tables built from the ISO 639 catalogue. */
export class LanguageRegistry {
    /**
     * @param {{alpha2?: string|null, alpha3: string, bibliographic?: string|null, name: string, scope?: string}[]} languages Catalogue entries.
     */
    constructor(languages) {
        this.languages = languages;
        this.byCode = new Map();
        for (const language of languages) {
            for (const code of [language.alpha2, language.alpha3, language.bibliographic]) {
                if (code && !this.byCode.has(code.toLowerCase())) this.byCode.set(code.toLowerCase(), language);
            }
        }
    }

    /** @returns {number} Number of languages in the catalogue. */
    get size() { return this.languages.length; }

    /**
     * Resolve a code, locale tag or English name to a catalogue entry.
     * @param {string} value `tr`, `tur`, `tr-TR` or `Turkish`.
     * @returns {object|null} Catalogue entry, or null if unknown.
     */
    find(value) {
        const text = String(value || "").trim().toLowerCase();
        if (!text) return null;
        const code = NAME_ALIASES[text] || text.split(/[-_]/)[0];
        return this.byCode.get(code)
            || this.languages.find((language) => language.name.toLowerCase() === text)
            || null;
    }

    /**
     * Normalise any language reference to the shortest ISO code.
     * @param {string} value Code, tag or name.
     * @returns {string} Two-letter code when one exists, else the three-letter code, else "und".
     */
    code(value) {
        const entry = this.find(value);
        return entry ? (entry.alpha2 || entry.alpha3) : "und";
    }

    /**
     * Display name for a language.
     * @param {string} value Code, tag or name.
     * @returns {string} English name, or "Unknown language".
     */
    name(value) {
        return this.find(value)?.name || "Unknown language";
    }
}

/**
 * Load the bundled registry once and reuse it.
 * @param {{languages: object[]}} [preloaded] Registry data (used by tests).
 * @returns {Promise<LanguageRegistry>} The registry.
 */
export function loadLanguageRegistry(preloaded) {
    if (preloaded) return Promise.resolve(new LanguageRegistry(preloaded.languages));
    if (!registryPromise) {
        registryPromise = fetch(new URL("../../database/languages.json", import.meta.url))
            .then((response) => {
                if (!response.ok) throw new Error("Language registry unavailable.");
                return response.json();
            })
            .then((json) => new LanguageRegistry(json.languages))
            .catch((error) => { registryPromise = null; throw error; });
    }
    return registryPromise;
}
