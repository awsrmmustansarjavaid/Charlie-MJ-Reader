/**
 * @file Last-resort analyzer that works for every language and script.
 *
 * It makes no linguistic claim beyond what can be seen in the characters
 * themselves (digits, capitalisation, script), so unsupported languages get an
 * honest "no grammar model" result instead of a guess.
 */
import { detectScript } from "../detect.js";

/** Human readable script names for the details list. */
const SCRIPT_NAMES = Object.freeze({
    hangul: "Hangul", kana: "Japanese kana", han: "Han (Chinese characters)", thai: "Thai", greek: "Greek",
    hebrew: "Hebrew", armenian: "Armenian", georgian: "Georgian", bengali: "Bengali", tamil: "Tamil",
    telugu: "Telugu", devanagari: "Devanagari", arabic: "Arabic", cyrillic: "Cyrillic", latin: "Latin", unknown: "Unknown"
});

/** Generic analyzer, always the final fallback. */
export const genericAnalyzer = {
    id: "generic-heuristics",
    name: "Generic script heuristics",
    tier: "heuristic",
    languages: "*",

    /**
     * @param {string} word Word under the cursor.
     * @param {{isSentenceStart?: boolean}} context Engine context.
     * @returns {Promise<object>} Partial result (never null).
     */
    async analyze(word, context) {
        const { script } = detectScript(word);
        const details = [["Script", SCRIPT_NAMES[script] || "Unknown"], ["Length", `${[...word].length} characters`]];
        if (/^\p{N}+([.,]\p{N}+)*$/u.test(word)) {
            return { category: "numeral", confidence: 0.9, details: [["Type", "number"], ...details] };
        }
        if (/^\p{Lu}/u.test(word) && !context.isSentenceStart && [...word].length > 1) {
            return { category: "proper-noun", confidence: 0.35, details: [...details, ["Basis", "capitalised in the middle of a sentence"]] };
        }
        return { category: "unknown", confidence: 0, details };
    }
};
