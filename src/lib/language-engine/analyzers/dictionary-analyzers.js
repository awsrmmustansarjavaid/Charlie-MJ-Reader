/**
 * @file Network-backed analyzers that supply meaning and part of speech for
 * languages without a dedicated rule-based model.
 *
 *  - Wiktionary: part of speech and definitions for thousands of languages;
 *    this is what extends grammar coverage beyond the bundled rule packs.
 *  - Free Dictionary API: English-specific definitions and part of speech.
 *  - MyMemory: machine translation, used only as a last resort for meaning.
 *
 * All requests are read-only GETs, time out quickly, and fail soft (they
 * return null) so one unavailable service never breaks the tooltip.
 */
import { categoryFromLabel } from "../categories.js";

/** Network timeout per request, in milliseconds. */
const REQUEST_TIMEOUT_MS = 4500;

/** Longest meaning text shown in the tooltip. */
const MAX_MEANING_LENGTH = 260;

/** Maximum definitions joined into one meaning string. */
const MAX_DEFINITIONS = 2;

/**
 * Convert an HTML snippet from Wiktionary into plain text.
 * @param {string} html Definition markup.
 * @returns {string} Plain text.
 */
export function htmlToText(html) {
    return String(html || "")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/\s+/g, " ").trim();
}

/**
 * Fetch JSON with a timeout; returns null for any failure or non-OK status.
 * @param {typeof fetch} fetchImpl Fetch implementation.
 * @param {string} url Request URL.
 * @returns {Promise<unknown|null>} Parsed JSON or null.
 */
async function fetchJson(fetchImpl, url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Trim a meaning to the display limit.
 * @param {string} text Meaning text.
 * @returns {string} Possibly shortened text.
 */
function clip(text) {
    return text.length > MAX_MEANING_LENGTH ? `${text.slice(0, MAX_MEANING_LENGTH - 1)}…` : text;
}

/** Wiktionary analyzer: works for any language that has an entry for the word. */
export const wiktionaryAnalyzer = {
    id: "wiktionary",
    name: "Wiktionary",
    tier: "dictionary",
    languages: "*",
    needsNetwork: true,

    /**
     * @param {string} word Word under the cursor.
     * @param {{languageCode: string, languageName: string, fetch: typeof fetch}} context Engine context.
     * @returns {Promise<object|null>} Partial grammar result.
     */
    async analyze(word, context) {
        const attempts = [...new Set([word, word.toLocaleLowerCase(context.languageCode)])];
        for (const attempt of attempts) {
            const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(attempt)}`;
            const json = await fetchJson(context.fetch, url);
            if (!json || typeof json !== "object") continue;

            // Wiktionary keys sections by its own language code; match by code or by name.
            const sections = json[context.languageCode]
                || Object.values(json).find((list) => Array.isArray(list) && list[0]?.language === context.languageName);
            if (!Array.isArray(sections) || !sections.length) continue;

            const first = sections[0];
            const definitions = sections.flatMap((section) => (section.definitions || []).map((entry) => htmlToText(entry.definition)))
                .filter(Boolean).slice(0, MAX_DEFINITIONS);
            const classes = [...new Set(sections.map((section) => section.partOfSpeech).filter(Boolean))];
            const details = [["Part of speech (Wiktionary)", first.partOfSpeech]];
            if (classes.length > 1) details.push(["Also listed as", classes.slice(1).join(", ")]);
            const formOf = definitions.find((text) => /\b(?:form|person|tense|plural|case|participle|imperative|inflection|singular)\b.*\bof\b/i.test(text));
            if (formOf) details.push(["Inflected form", formOf]);

            return {
                category: categoryFromLabel(first.partOfSpeech),
                confidence: 0.85,
                meaning: clip(definitions.join("; ")),
                alternativeCategories: classes.slice(1).map(categoryFromLabel).filter((category) => category !== "unknown"),
                details,
                source: "Wiktionary"
            };
        }
        return null;
    }
};

/** Free Dictionary API analyzer: English only. */
export const englishDictionaryAnalyzer = {
    id: "free-dictionary-api",
    name: "Free Dictionary API",
    tier: "dictionary",
    languages: ["en"],
    needsNetwork: true,

    /**
     * @param {string} word English word.
     * @param {{fetch: typeof fetch}} context Engine context.
     * @returns {Promise<object|null>} Partial grammar result.
     */
    async analyze(word, context) {
        const json = await fetchJson(context.fetch, `https://api.dictionaryapi.dev/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`);
        const entry = Array.isArray(json) ? json[0] : null;
        const meaning = entry?.meanings?.[0];
        if (!meaning) return null;
        const definitions = (meaning.definitions || []).map((item) => item.definition).filter(Boolean).slice(0, MAX_DEFINITIONS);
        const details = [["Part of speech (dictionary)", meaning.partOfSpeech]];
        if (entry.phonetic) details.push(["Pronunciation", entry.phonetic]);
        return {
            category: categoryFromLabel(meaning.partOfSpeech),
            confidence: 0.85,
            meaning: clip(definitions.join("; ")),
            alternativeCategories: (entry.meanings || []).slice(1).map((item) => categoryFromLabel(item.partOfSpeech)).filter((c) => c !== "unknown"),
            details,
            source: "Free Dictionary API"
        };
    }
};

/** MyMemory translation analyzer: meaning only, used when no dictionary has the word. */
export const translationAnalyzer = {
    id: "mymemory-translation",
    name: "MyMemory translation",
    tier: "dictionary",
    languages: "*",
    needsNetwork: true,
    meaningOnly: true,

    /**
     * @param {string} word Word under the cursor.
     * @param {{languageCode: string, meaningLanguage: string, fetch: typeof fetch}} context Engine context.
     * @returns {Promise<object|null>} Partial result containing only a meaning.
     */
    async analyze(word, context) {
        const source = context.languageCode;
        const target = context.meaningLanguage || "en";
        // MyMemory accepts two-letter codes; skip anything else rather than guess.
        if (!/^[a-z]{2}$/.test(source) || source === target) return null;
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${source}|${target}`;
        const json = await fetchJson(context.fetch, url);
        const text = json?.responseData?.translatedText;
        if (!text || String(text).toLowerCase() === word.toLowerCase()) return null;
        return {
            meaning: clip(`${text} (machine translation to ${target})`),
            details: [["Meaning source", "MyMemory machine translation; verify before relying on it"]],
            source: "MyMemory"
        };
    }
};
