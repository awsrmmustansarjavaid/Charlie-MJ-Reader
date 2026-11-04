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
import { collectEvidence } from "./detect.js";
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
        const key = `${context.languageHint || ""}|${(context.extraLanguages || []).join(",")}|${context.meaningLanguage || "en"}|${word.toLocaleLowerCase()}|${(context.sentence || "").length > 0}`;
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
     * How well a language's own (offline) analyzers can parse a word.
     * @param {string} word Normalised word.
     * @param {string} code Candidate language code.
     * @param {object} context Caller context.
     * @returns {Promise<number>} Highest analyzer confidence, or 0 when nothing parses.
     */
    async parseWith(word, code, context) {
        let best = 0;
        for (const analyzer of this.analyzers) {
            if (analyzer.tier !== "language-specific" || !(analyzer.languages === "*" || analyzer.languages.includes(code))) continue;
            try {
                const output = await analyzer.analyze(word, { ...context, languageCode: code, languageName: this.registry.name(code), fetch: this.fetch });
                if (output?.category && output.category !== "unknown") best = Math.max(best, output.confidence ?? 0);
            } catch { /* A failing analyzer simply does not vouch for the word. */ }
        }
        return best;
    }

    /**
     * Decide the language of the hovered word.
     *
     * The article's language is NOT the word's language (an English article can
     * teach Turkish), so candidates come from the word's own evidence first:
     * script, then letters, then the sentence, and only then the hints. A
     * candidate is confirmed when its analyzer can actually parse the word.
     * @param {string} word Normalised word.
     * @param {object} context Caller context.
     * @returns {Promise<{code: string, name: string, confidence: number, method: string, confirmed: boolean, tried: string[], ambiguous: string[]}>} Chosen language.
     */
    async chooseLanguage(word, context) {
        const toCode = (value) => this.registry.code(value);
        const evidence = collectEvidence(word, context, toCode);
        const describe = (code, confidence, method, confirmed, tried) => ({
            code, name: this.registry.name(code), confidence, method, confirmed, tried, ambiguous: []
        });
        const tried = [];
        const probe = async (candidate) => {
            if (!tried.includes(candidate.code)) tried.push(candidate.code);
            return this.parseWith(word, candidate.code, context);
        };

        // Strong evidence (script or language-specific letters): first candidate whose analyzer parses the word wins.
        for (const candidate of evidence.strong) {
            if ((await probe(candidate)) >= 0.5) return describe(candidate.code, Math.max(candidate.confidence, 0.9), candidate.method, true, tried);
        }
        if (evidence.strong.length) {
            const first = evidence.strong[0];
            return describe(first.code, first.confidence, first.method, false, tried);
        }

        // Weak evidence (shared letters, sentence, hints): confirm by parsing, best parse wins, ties keep evidence order.
        const weak = [...evidence.weak].sort((a, b) => b.confidence - a.confidence).slice(0, 6);
        let confirmed = null;
        for (const candidate of weak) {
            const score = await probe(candidate);
            if (score >= 0.5 && (!confirmed || score > confirmed.score)) confirmed = { candidate, score };
        }
        if (confirmed) return describe(confirmed.candidate.code, Math.max(confirmed.candidate.confidence, 0.8), confirmed.candidate.method, true, tried);

        // Nothing parses: stay honest for ambiguous scripts, otherwise take the best evidence.
        if (evidence.ambiguous.length && !weak.some((candidate) => candidate.method === "hint")) {
            const names = evidence.ambiguous.map((code) => this.registry.name(code));
            return { code: "und", name: `Arabic-script · likely ${names.slice(0, -1).join(", ")} or ${names.at(-1)}`, confidence: 0.3, method: "script", confirmed: false, tried, ambiguous: evidence.ambiguous };
        }
        if (weak.length) return describe(weak[0].code, weak[0].confidence, weak[0].method, false, tried);
        return describe("und", 0, "default", false, tried);
    }

    /**
     * Run language identification and all applicable analyzers, then merge.
     * @param {string} word Normalised word.
     * @param {object} context Caller context.
     * @returns {Promise<GrammarResult>} Merged result.
     */
    async run(word, context) {
        const language = await this.chooseLanguage(word, context);
        const code = language.code;
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
        if (language.ambiguous?.length) note = "These languages share the same letters, so this short word cannot be assigned to one of them. Set the article language to improve results.";
        else if (language.code === "und") note = "The language could not be identified. Set the article language to improve results.";
        else if (!hasSpecific && !hasDictionary) note = `No grammar model or dictionary entry is available for ${language.name}. Only script-level information is shown.`;
        else if (!hasSpecific) note = `${language.name} has no built-in grammar rules; the class comes from dictionary data.`;
        else if (category === "unknown") note = `Could not classify "${word}". Languages tried: ${[...new Set([language.code, ...(language.tried || [])])].map((code) => this.registry.name(code)).join(", ")}.`;

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
