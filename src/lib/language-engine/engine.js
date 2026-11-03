/**
 * @file Unified language-processing engine.
 *
 * One entry point, {@link LanguageEngine.analyze}, serves every language:
 *
 *   word + context  ->  language identification  ->  analyzers  ->  merged result
 *
 * Analyzers are plug-ins with a common interface, so supporting a new language
 * never requires changing the engine or the UI:
 *
 *   - add a JSON pack (see analyzers/lexicon-analyzer.js), or
 *   - write an analyzer object `{ id, name, tier, languages, analyze }` and call
 *     `engine.register(analyzer)`.
 *
 * Coverage is tiered and always reported honestly:
 *   language-specific : a rule-based model for that language (offline);
 *   dictionary        : Wiktionary / dictionary lookup (thousands of languages, online);
 *   heuristic         : script and capitalisation checks only (every language).
 */
import { categoryLabel } from "./categories.js";
import { detectLanguage } from "./detect.js";
import { loadLanguageRegistry } from "./languages.js";
import { turkishAnalyzer } from "./analyzers/turkish.js";
import { genericAnalyzer } from "./analyzers/generic-analyzer.js";
import { englishDictionaryAnalyzer, translationAnalyzer, wiktionaryAnalyzer } from "./analyzers/dictionary-analyzers.js";
import { loadBundledPackAnalyzers } from "./packs/index.js";

/** Maximum cached results kept in memory. */
const DEFAULT_CACHE_SIZE = 500;

/** Maximum detail rows returned (keeps the tooltip compact). */
const MAX_DETAIL_ROWS = 10;

/** Confidence a dictionary part-of-speech needs to override a weak rule-based guess. */
const DICTIONARY_OVERRIDE_CONFIDENCE = 0.8;

/** Rank used to break ties between analyzer tiers (higher wins). */
const TIER_RANK = Object.freeze({ "language-specific": 3, dictionary: 2, heuristic: 1 });

/**
 * @typedef {Object} GrammarResult
 * @property {string} word Normalised word that was analysed.
 * @property {{code: string, name: string, confidence: number, method: string}} language Identified language.
 * @property {string} category Canonical category identifier.
 * @property {string} categoryLabel Display label.
 * @property {number} confidence Confidence of the category from 0 to 1.
 * @property {string} meaning Word meaning (may be empty).
 * @property {string} lemma Dictionary form when known (may be empty).
 * @property {[string, string][]} details Grammatical details as label/value pairs.
 * @property {string[]} sources Names of the analyzers that contributed.
 * @property {"full"|"partial"|"minimal"} coverage How complete the analysis is for this language.
 * @property {string} note Plain-language caveat shown to the reader.
 */

/** Strip surrounding punctuation from a raw selection. */
function normalizeWord(raw) {
    return String(raw || "").normalize("NFC").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’-]+$/gu, "").replace(/’/g, "'");
}

/** The language engine. */
export class LanguageEngine {
    /**
     * @param {object} options Engine options.
     * @param {import("./languages.js").LanguageRegistry} options.registry Language registry.
     * @param {object[]} [options.analyzers] Analyzers to register immediately.
     * @param {typeof fetch} [options.fetchImpl] Fetch implementation for network analyzers.
     * @param {number} [options.cacheSize] Maximum cached results.
     */
    constructor({ registry, analyzers = [], fetchImpl = globalThis.fetch?.bind(globalThis), cacheSize = DEFAULT_CACHE_SIZE }) {
        this.registry = registry;
        this.fetch = fetchImpl;
        this.cacheSize = cacheSize;
        /** @type {object[]} */
        this.analyzers = [];
        /** @type {Map<string, Promise<GrammarResult>>} */
        this.cache = new Map();
        analyzers.forEach((analyzer) => this.register(analyzer));
    }

    /**
     * Register an analyzer plug-in.
     * @param {{id: string, tier: string, languages: string[]|"*", analyze: Function}} analyzer Analyzer object.
     * @returns {this} The engine, for chaining.
     */
    register(analyzer) {
        if (!analyzer?.id || typeof analyzer.analyze !== "function") throw new TypeError("An analyzer needs an id and an analyze() function.");
        this.analyzers = this.analyzers.filter((existing) => existing.id !== analyzer.id).concat(analyzer);
        this.cache.clear();
        return this;
    }

    /**
     * Describe the grammar support available for a language.
     * @param {string} language Code, tag or name.
     * @returns {{code: string, name: string, specific: boolean, dictionary: boolean}} Support summary.
     */
    support(language) {
        const code = this.registry.code(language);
        const matches = (analyzer) => analyzer.languages === "*" || analyzer.languages.includes(code);
        return {
            code,
            name: this.registry.name(code),
            specific: this.analyzers.some((analyzer) => analyzer.tier === "language-specific" && matches(analyzer)),
            dictionary: this.analyzers.some((analyzer) => analyzer.tier === "dictionary" && matches(analyzer))
        };
    }

    /**
     * Analyse a word.
     * @param {string} rawWord Word under the cursor.
     * @param {{sentence?: string, languageHint?: string, meaningLanguage?: string, isSentenceStart?: boolean, offline?: boolean}} [context] Surrounding text and options.
     * @returns {Promise<GrammarResult>} Merged analysis.
     */
    analyze(rawWord, context = {}) {
        const word = normalizeWord(rawWord);
        if (!word) return Promise.resolve(this.emptyResult(rawWord));
        const key = `${context.languageHint || ""}|${context.meaningLanguage || "en"}|${word.toLocaleLowerCase()}|${(context.sentence || "").length > 0}`;
        if (this.cache.has(key)) return this.cache.get(key);

        const promise = this.run(word, context).catch((error) => {
            this.cache.delete(key);
            throw error;
        });
        this.cache.set(key, promise);
        if (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value);
        return promise;
    }

    /** @returns {GrammarResult} Placeholder result for empty input. */
    emptyResult(word) {
        return {
            word: String(word || ""), language: { code: "und", name: "Unknown language", confidence: 0, method: "default" },
            category: "unknown", categoryLabel: categoryLabel("unknown"), confidence: 0, meaning: "", lemma: "",
            details: [], sources: [], coverage: "minimal", note: "No word detected."
        };
    }

    /**
     * Run language identification and all applicable analyzers, then merge.
     * @param {string} word Normalised word.
     * @param {object} context Caller context.
     * @returns {Promise<GrammarResult>} Merged result.
     */
    async run(word, context) {
        const detection = detectLanguage(word, context, (value) => this.registry.code(value));
        const code = this.registry.code(detection.code);
        const language = { code, name: this.registry.name(code), confidence: detection.confidence, method: detection.method };
        const analyzerContext = {
            ...context,
            languageCode: code,
            languageName: language.name,
            meaningLanguage: context.meaningLanguage || "en",
            fetch: this.fetch
        };

        const applicable = this.analyzers.filter((analyzer) => analyzer.languages === "*" || analyzer.languages.includes(code));
        const canUseNetwork = !context.offline && globalThis.navigator?.onLine !== false;
        const runAnalyzers = (list) => Promise.all(list
            .filter((analyzer) => canUseNetwork || !analyzer.needsNetwork)
            .map(async (analyzer) => {
                try {
                    const output = await analyzer.analyze(word, analyzerContext);
                    return output ? { analyzer, output } : null;
                } catch (error) {
                    console.warn(`Charlie MJ Reader: analyzer "${analyzer.id}" failed.`, error);
                    return null;
                }
            }));

        // Meaning-only analyzers (machine translation) run only when nothing else supplied a meaning.
        const settled = (await runAnalyzers(applicable.filter((analyzer) => !analyzer.meaningOnly))).filter(Boolean);
        if (!settled.some(({ output }) => output.meaning)) {
            settled.push(...(await runAnalyzers(applicable.filter((analyzer) => analyzer.meaningOnly))).filter(Boolean));
        }
        return this.merge(word, language, settled, applicable);
    }

    /**
     * Merge analyzer outputs into one result.
     *
     * Category: the highest-confidence candidate wins. A dictionary part of
     * speech overrides a weak rule-based guess, and ties favour rule-based
     * analyzers because they also explain the morphology.
     * Meaning: first dictionary meaning, then translation.
     * @param {string} word Normalised word.
     * @param {GrammarResult["language"]} language Identified language.
     * @param {{analyzer: object, output: object}[]} results Non-empty analyzer outputs.
     * @param {object[]} applicable Analyzers that were eligible for this language.
     * @returns {GrammarResult} Merged result.
     */
    merge(word, language, results, applicable) {
        const candidates = results.filter(({ output }) => output.category && output.category !== "unknown");
        const effective = ({ analyzer, output }) => output.confidence ?? 0;
        candidates.sort((a, b) => effective(b) - effective(a) || (TIER_RANK[b.analyzer.tier] || 0) - (TIER_RANK[a.analyzer.tier] || 0));
        let winner = candidates[0] || null;

        // A trusted dictionary class replaces a weak rule-based guess.
        const dictionary = candidates.find(({ analyzer, output }) => analyzer.tier === "dictionary" && (output.confidence ?? 0) >= DICTIONARY_OVERRIDE_CONFIDENCE);
        if (dictionary && winner && winner.analyzer.tier === "language-specific" && (winner.output.confidence ?? 0) < 0.6) winner = dictionary;

        const category = winner?.output.category || "unknown";
        const meaning = results.map(({ output }) => output.meaning).find(Boolean) || "";
        const lemma = results.map(({ output }) => output.lemma).find(Boolean) || "";

        // Details: winner first, then everything else, de-duplicated and capped.
        const ordered = winner ? [winner, ...results.filter((entry) => entry !== winner)] : results;
        const seen = new Set();
        const details = [];
        // Script-level heuristics are only worth showing when nothing better exists.
        const informative = ordered.some(({ analyzer, output }) => analyzer.tier !== "heuristic" && (output.details || []).length);
        for (const { analyzer, output } of ordered) {
            if (informative && analyzer.tier === "heuristic") continue;
            for (const [label, value] of output.details || []) {
                const id = `${label}=${value}`;
                if (!seen.has(id) && value) { seen.add(id); details.push([label, String(value)]); }
            }
        }
        const alternatives = [...new Set(results.flatMap(({ output }) => output.alternativeCategories || []))].filter((c) => c !== category);
        if (alternatives.length) details.push(["Other possible classes", alternatives.map(categoryLabel).join(", ")]);

        const hasSpecific = applicable.some((analyzer) => analyzer.tier === "language-specific");
        const hasDictionary = results.some(({ analyzer }) => analyzer.tier === "dictionary");
        const coverage = hasSpecific && hasDictionary ? "full" : hasSpecific || hasDictionary ? "partial" : "minimal";
        let note = "";
        if (language.code === "und") note = "The language could not be identified. Set the article language to improve results.";
        else if (!hasSpecific && !hasDictionary) note = `No grammar model or dictionary entry is available for ${language.name}. Only script-level information is shown.`;
        else if (!hasSpecific) note = `${language.name} has no built-in grammar rules; the class comes from dictionary data.`;
        else if (category === "unknown") note = `The ${language.name} analyzer did not recognise this word.`;

        return {
            word, language, category, categoryLabel: categoryLabel(category), confidence: winner?.output.confidence ?? 0,
            meaning, lemma, details: details.slice(0, MAX_DETAIL_ROWS),
            sources: [...new Set(results
                .filter(({ analyzer }) => !(informative && analyzer.tier === "heuristic"))
                .map(({ output, analyzer }) => output.source || analyzer.name))],
            coverage, note
        };
    }
}

/**
 * Create the engine with every bundled analyzer registered.
 * @param {{registryData?: {languages: object[]}, fetchImpl?: typeof fetch}} [options] Test overrides.
 * @returns {Promise<LanguageEngine>} Ready-to-use engine.
 */
export async function createDefaultEngine(options = {}) {
    const registry = await loadLanguageRegistry(options.registryData);
    const packs = options.skipPacks ? [] : await loadBundledPackAnalyzers();
    return new LanguageEngine({
        registry,
        fetchImpl: options.fetchImpl,
        analyzers: [turkishAnalyzer, ...packs, englishDictionaryAnalyzer, wiktionaryAnalyzer, translationAnalyzer, genericAnalyzer]
    });
}
