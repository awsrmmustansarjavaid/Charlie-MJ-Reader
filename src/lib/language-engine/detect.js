/**
 * @file Lightweight language identification for single words and sentences.
 *
 * Identifying one of 7,900 languages from a single word is not possible
 * offline, so detection is layered, from most to least reliable:
 *
 *   1. script analysis (Hangul, Greek, Thai, ...) and script-specific letters;
 *   2. language-specific diacritics (e.g. Turkish "ı", Spanish "ñ");
 *   3. stop-word voting over the surrounding sentence (major Latin-script languages);
 *   4. the language hint supplied by the caller (article language or the learner's target).
 *
 * The page language is only a last resort here: it decides the language of the
 * *meaning*, not the language of the hovered word. An English article that
 * teaches Turkish contains Turkish words, so the word's own evidence always
 * outranks the hint. `collectEvidence` returns ranked candidates; the engine
 * then confirms a candidate by checking that its analyzer can actually parse
 * the word (for example "kal" + "-sın" as a Turkish imperative).
 */

/** Script tests in priority order; the first match decides the script. */
const SCRIPTS = [
    ["hangul", /\p{Script=Hangul}/u, "ko"],
    ["kana", /[\p{Script=Hiragana}\p{Script=Katakana}]/u, "ja"],
    ["han", /\p{Script=Han}/u, "zh"],
    ["thai", /\p{Script=Thai}/u, "th"],
    ["greek", /\p{Script=Greek}/u, "el"],
    ["hebrew", /\p{Script=Hebrew}/u, "he"],
    ["armenian", /\p{Script=Armenian}/u, "hy"],
    ["georgian", /\p{Script=Georgian}/u, "ka"],
    ["bengali", /\p{Script=Bengali}/u, "bn"],
    ["tamil", /\p{Script=Tamil}/u, "ta"],
    ["telugu", /\p{Script=Telugu}/u, "te"],
    ["devanagari", /\p{Script=Devanagari}/u, "hi"],
    ["arabic", /\p{Script=Arabic}/u, "ar"],
    ["cyrillic", /\p{Script=Cyrillic}/u, "ru"],
    ["latin", /\p{Script=Latin}/u, null]
];

/** Letters that separate languages sharing the Arabic script. */
const ARABIC_SCRIPT_HINTS = [
    [/[ٹڈڑںےۓ]/u, "ur"],
    [/[پچژگ]/u, "fa"],
    [/[ڤ]/u, "ar"]
];

/** Letters that separate languages sharing the Cyrillic script. */
const CYRILLIC_HINTS = [
    [/[їєґ]/iu, "uk"], [/ў/iu, "be"], [/[ђћ]/iu, "sr"], [/ѓ|ќ/iu, "mk"], [/[ыэё]/iu, "ru"]
];

/** Diacritics that strongly indicate a Latin-script language. */
const LATIN_DIACRITICS = [
    [/[ıİşŞğĞ]/u, "tr"], [/[ñ¿¡]/u, "es"], [/ß/u, "de"], [/[ãõ]/u, "pt"],
    [/[ąćęłńśźż]/iu, "pl"], [/[ěřůďťň]/iu, "cs"], [/[őű]/iu, "hu"], [/[ăâîșț]/iu, "ro"]
];

/** Frequent function words per language, used to vote on a whole sentence. */
const STOPWORDS = Object.freeze({
    en: "the and of to in is that it for with was on are as this be at by have from or an not you",
    tr: "ve bir bu için ile de da çok daha gibi ama ne kadar olarak olan ben sen biz siz var yok mi değil",
    es: "el la los las de que y en un una es por con para no se lo como más pero su al",
    fr: "le la les de des et en un une est que pour dans qui pas sur avec au ce il elle nous vous",
    de: "der die das und ist nicht ein eine zu den mit von sich auf für dem im auch es ich sie wir",
    it: "il lo la gli le di che e un una è per con non si come più ma del della sono",
    pt: "o a os as de que e em um uma é por com não se para como mais mas do da são",
    nl: "de het een en van is dat niet te op voor met zijn ze maar ook als aan er",
    sv: "och att det som en är på för med av inte den till har de"
});

/** Pre-built word sets for stop-word voting. */
const STOPWORD_SETS = Object.fromEntries(Object.entries(STOPWORDS).map(([code, text]) => [code, new Set(text.split(" "))]));

/**
 * @typedef {Object} DetectionResult
 * @property {string} code Detected ISO code, or "und" when unknown.
 * @property {number} confidence Value from 0 to 1.
 * @property {"script"|"diacritics"|"stopwords"|"hint"|"default"} method Evidence used.
 */

/**
 * Identify the script of a piece of text.
 * @param {string} text Word or sentence.
 * @returns {{script: string, code: string|null}} Script name and its default language, if any.
 */
export function detectScript(text) {
    for (const [script, pattern, code] of SCRIPTS) if (pattern.test(text)) return { script, code };
    return { script: "unknown", code: null };
}

/**
 * Detect the language of a word, using sentence context and a hint.
 * @param {string} word The word under the cursor.
 * @param {{sentence?: string, languageHint?: string}} [context] Surrounding text and the caller's expected language.
 * @param {(value: string) => string} [normalizeCode] Resolves names/tags to ISO codes.
 * @returns {DetectionResult} Detection outcome.
 */
export function detectLanguage(word, context = {}, normalizeCode = (value) => String(value || "").toLowerCase()) {
    const hint = context.languageHint ? normalizeCode(context.languageHint) : "";
    const { script, code: scriptCode } = detectScript(word);

    // Non-Latin scripts: the script itself is strong evidence.
    if (script === "arabic") {
        const specific = ARABIC_SCRIPT_HINTS.find(([pattern]) => pattern.test(word));
        if (specific) return { code: specific[1], confidence: 0.85, method: "script" };
        if (["ar", "fa", "ur", "ps", "ku", "sd", "ug"].includes(hint)) return { code: hint, confidence: 0.8, method: "hint" };
        return { code: "ar", confidence: 0.5, method: "script" };
    }
    if (script === "cyrillic") {
        const specific = CYRILLIC_HINTS.find(([pattern]) => pattern.test(word));
        if (specific) return { code: specific[1], confidence: 0.85, method: "script" };
        if (["ru", "uk", "bg", "sr", "mk", "be", "kk", "mn", "tg", "ky"].includes(hint)) return { code: hint, confidence: 0.8, method: "hint" };
        return { code: "ru", confidence: 0.5, method: "script" };
    }
    if (script === "han" && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(context.sentence || "")) {
        return { code: "ja", confidence: 0.8, method: "script" };
    }
    if (script === "devanagari" && ["hi", "mr", "ne", "sa"].includes(hint)) return { code: hint, confidence: 0.8, method: "hint" };
    if (scriptCode) return { code: scriptCode, confidence: 0.75, method: "script" };

    // Latin script from here on.
    const diacritic = LATIN_DIACRITICS.find(([pattern]) => pattern.test(word));
    if (diacritic && (!hint || diacritic[1] === hint)) return { code: diacritic[1], confidence: 0.8, method: "diacritics" };

    const sentence = String(context.sentence || "").toLocaleLowerCase();
    const tokens = sentence.match(/[\p{L}'’-]+/gu) || [];
    if (tokens.length >= 4) {
        let best = { code: "", score: 0 };
        for (const [code, set] of Object.entries(STOPWORD_SETS)) {
            const score = tokens.filter((token) => set.has(token)).length;
            if (score > best.score) best = { code, score };
        }
        const share = best.score / tokens.length;
        if (best.score >= 2 && share >= 0.12) {
            // Agree with the hint when both point the same way; otherwise report the evidence.
            return { code: best.code, confidence: Math.min(0.9, 0.5 + share), method: "stopwords" };
        }
    }
    if (hint && hint !== "und") return { code: hint, confidence: 0.6, method: "hint" };
    if (diacritic) return { code: diacritic[1], confidence: 0.6, method: "diacritics" };
    // No hint: fall back to language-specific letters anywhere in the sentence.
    const sentenceDiacritic = LATIN_DIACRITICS.find(([pattern]) => pattern.test(context.sentence || ""));
    if (sentenceDiacritic) return { code: sentenceDiacritic[1], confidence: 0.55, method: "diacritics" };
    return { code: "und", confidence: 0, method: "default" };
}

/** Letters shared by several Latin-script languages: they narrow the field but cannot decide it. */
const SHARED_LETTERS = [
    [/[çöü]/iu, ["tr", "de", "fr", "hu", "az"]],
    [/[éèêàùâîôû]/iu, ["fr", "pt", "it", "ca"]],
    [/[áíóúý]/iu, ["es", "pt", "cs", "hu", "is"]],
    [/[äå]/iu, ["de", "sv", "fi", "et"]]
];

/** Languages that write with the Arabic script, used to report an honest "likely" list. */
const ARABIC_SCRIPT_LANGUAGES = ["ar", "fa", "ur", "ps", "ku", "sd", "ug"];

/**
 * @typedef {Object} Candidate
 * @property {string} code ISO code.
 * @property {number} confidence Strength of the evidence, 0 to 1.
 * @property {"script"|"letters"|"sentence"|"hint"} method Where the evidence came from.
 */

/**
 * Collect ranked language candidates for one word.
 *
 * Order of evidence, strongest first:
 *   1. script (Hangul, Greek, Thai ...) and script-specific letters;
 *   2. language-specific letters and word shape ("ı", "ñ", "ß" ...);
 *   3. letters shared by a few languages ("ö", "é" ...);
 *   4. the surrounding sentence (stop-word voting);
 *   5. the article language and the learner's languages (last resort).
 * @param {string} word The hovered word.
 * @param {{sentence?: string, languageHint?: string, extraLanguages?: string[]}} [context] Surrounding text and expected languages.
 * @param {(value: string) => string} [normalizeCode] Resolves names/tags to ISO codes.
 * @returns {{script: string, strong: Candidate[], weak: Candidate[], ambiguous: string[]}} Ranked evidence.
 */
export function collectEvidence(word, context = {}, normalizeCode = (value) => String(value || "").toLowerCase()) {
    const { script, code: scriptCode } = detectScript(word);
    const strong = [];
    const weak = [];
    const seen = new Set();
    const add = (list, code, confidence, method) => {
        if (code && code !== "und" && !seen.has(code)) { seen.add(code); list.push({ code, confidence, method }); }
    };
    const hints = [context.languageHint, ...(context.extraLanguages || [])].map((value) => normalizeCode(value)).filter((code) => code && code !== "und");

    // 1. Script-level evidence.
    let ambiguous = [];
    if (script === "arabic") {
        const specific = ARABIC_SCRIPT_HINTS.find(([pattern]) => pattern.test(word));
        if (specific) add(strong, specific[1], 0.85, "letters");
        else {
            // Short Arabic-script words are ambiguous: prefer a hinted Arabic-script language, otherwise stay honest.
            const hinted = hints.filter((code) => ARABIC_SCRIPT_LANGUAGES.includes(code));
            hinted.forEach((code) => add(weak, code, 0.6, "hint"));
            ambiguous = ["ar", "ur", "fa", "ps"];
            if (!hinted.length) ambiguous.forEach((code) => add(weak, code, 0.3, "script"));
        }
    } else if (script === "cyrillic") {
        const specific = CYRILLIC_HINTS.find(([pattern]) => pattern.test(word));
        if (specific) add(strong, specific[1], 0.85, "letters");
        else {
            hints.filter((code) => ["ru", "uk", "bg", "sr", "mk", "be", "kk", "mn", "tg", "ky"].includes(code)).forEach((code) => add(weak, code, 0.6, "hint"));
            add(weak, "ru", 0.4, "script");
        }
    } else if (script === "han" && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(context.sentence || "")) {
        add(strong, "ja", 0.8, "script");
    } else if (script === "devanagari") {
        hints.filter((code) => ["hi", "mr", "ne", "sa"].includes(code)).forEach((code) => add(strong, code, 0.7, "hint"));
        add(strong, "hi", 0.6, "script");
    } else if (scriptCode) {
        add(strong, scriptCode, 0.75, "script");
    }

    // 2. Language-specific letters and 3. letters shared by a few languages (Latin script only).
    if (script === "latin") {
        for (const [pattern, code] of LATIN_DIACRITICS) if (pattern.test(word)) add(strong, code, 0.85, "letters");
        for (const [pattern, codes] of SHARED_LETTERS) if (pattern.test(word)) codes.forEach((code, rank) => add(weak, code, 0.5 - rank * 0.04, "letters"));
    }

    // 4. Sentence context (stop-word voting).
    const tokens = (String(context.sentence || "").toLocaleLowerCase().match(/[\p{L}'’-]+/gu)) || [];
    if (script === "latin" && tokens.length >= 4) {
        let best = { code: "", score: 0 };
        for (const [code, set] of Object.entries(STOPWORD_SETS)) {
            const score = tokens.filter((token) => set.has(token)).length;
            if (score > best.score) best = { code, score };
        }
        const share = best.score / tokens.length;
        if (best.score >= 2 && share >= 0.12) add(weak, best.code, Math.min(0.7, 0.4 + share), "sentence");
    }

    // 5. Hints decide last: the article language is not the word's language.
    hints.forEach((code, rank) => add(weak, code, rank === 0 ? 0.35 : 0.3, "hint"));
    return { script, strong, weak, ambiguous };
}
