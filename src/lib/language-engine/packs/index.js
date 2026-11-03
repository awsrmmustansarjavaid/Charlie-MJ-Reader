/**
 * @file Registry of bundled language packs.
 *
 * To add a language: create `<code>.json` in this folder following the format
 * documented in `analyzers/lexicon-analyzer.js`, then add one line below.
 */
import { createLexiconAnalyzer } from "../analyzers/lexicon-analyzer.js";

/** Pack file names (without extension) bundled with the extension. */
const PACK_FILES = ["en", "es", "fr", "de", "ur", "ar"];

/**
 * Load every bundled pack and return one analyzer per language.
 * @returns {Promise<object[]>} Analyzers ready to register with the engine.
 */
export async function loadBundledPackAnalyzers() {
    const analyzers = [];
    for (const file of PACK_FILES) {
        try {
            const response = await fetch(new URL(`./${file}.json`, import.meta.url));
            if (response.ok) analyzers.push(createLexiconAnalyzer(await response.json()));
        } catch (error) {
            console.warn(`Charlie MJ Reader: language pack "${file}" could not be loaded.`, error);
        }
    }
    return analyzers;
}
