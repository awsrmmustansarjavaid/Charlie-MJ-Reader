/**
 * @file Rule-based Turkish morphological analyzer.
 *
 * Turkish is agglutinative: grammar is carried by chains of suffixes that obey
 * vowel harmony, so a plain word list is not enough. This analyzer:
 *
 *   1. recognises closed-class words (pronouns, conjunctions, postpositions...);
 *   2. parses finite verb forms as stem + [negation] + tense/mood + [person];
 *   3. recognises common derivational suffixes (-lık, -sız, -cı ...);
 *   4. parses nominal chains as stem + [plural] + [possessive] + [case].
 *
 * It is rule-based and deliberately conservative: when a form is ambiguous the
 * confidence is lowered and the details say so, instead of claiming certainty.
 */

/** Closed-class word lists (inflected pronoun forms included). */
const CLOSED_CLASS = Object.freeze({
    pronoun: "ben sen o biz siz onlar bana sana ona bize size onlara beni seni onu bizi sizi onları benim senin onun bizim sizin onların bende sende onda benden senden ondan bu şu bunu şunu buna şuna bunun şunun kim ne kendi kendisi kendini herkes hepsi birbirini birbirine hiçbiri bazısı",
    conjunction: "ve ama fakat ancak çünkü veya yahut ya hem ki oysa halbuki yani ayrıca üstelik eğer madem mademki gerçi sanki hatta lakin ise",
    preposition: "için gibi kadar göre rağmen karşı önce sonra beri dolayı üzere doğru ile yana dair hakkında sayesinde boyunca içinde üstünde altında yanında arasında önünde arkasında",
    determiner: "bir her bazı bütün birkaç hiçbir tüm diğer başka öbür çeşitli birçok",
    numeral: "sıfır iki üç dört beş altı yedi sekiz dokuz on yirmi otuz kırk elli altmış yetmiş seksen doksan yüz bin milyon ilk ikinci üçüncü dördüncü beşinci",
    particle: "de da mi mı mu mü değil var yok evet hayır",
    adverb: "çok daha en az belki hemen şimdi artık hâlâ hala henüz bile yine hiç sadece yalnız bugün dün yarın burada orada şurada nasıl neden niçin nerede nereye nereden zaten bazen genellikle sık sıkça asla",
    interjection: "aman hey eyvah ah oh vay hay yazık"
});

/** Common verb stems; a match lifts confidence and skips the vowel-harmony check. */
const VERB_STEMS = new Set(`ol et yap gel git ver al gör bil de ye iç sev iste kal çık koy dur bak oku yaz konuş anla bul başla
    çalış öğren söyle düşün geç tut ara sor cevapla kullan yaşa bekle gül ağla uyu otur kalk yürü koş getir götür bırak kaybet
    kazan oyna dinle izle seç ayır aç kapat sat öde kes çiz anlat hatırla unut sür say belirt değiş kal taşı bağla ulaş tanı
    yardım dene seyret paylaş geliş sağla göster giy çalıştır ilerle`.split(/\s+/));

/** Person endings for aspect tenses (-iyor, -mış, -ecek, aorist). */
const ASPECT_PERSONS = [
    ["um", "1st singular"], ["üm", "1st singular"], ["ım", "1st singular"], ["im", "1st singular"],
    ["sun", "2nd singular"], ["sün", "2nd singular"], ["sın", "2nd singular"], ["sin", "2nd singular"],
    ["", "3rd singular"],
    ["uz", "1st plural"], ["üz", "1st plural"], ["ız", "1st plural"], ["iz", "1st plural"],
    ["sunuz", "2nd plural"], ["sünüz", "2nd plural"], ["sınız", "2nd plural"], ["siniz", "2nd plural"],
    ["lar", "3rd plural"], ["ler", "3rd plural"]
];

/** Person endings after the definite past (-dı) and conditional (-sa). */
const PAST_PERSONS = [
    ["m", "1st singular"], ["n", "2nd singular"], ["", "3rd singular"], ["k", "1st plural"],
    ["nız", "2nd plural"], ["niz", "2nd plural"], ["nuz", "2nd plural"], ["nüz", "2nd plural"],
    ["lar", "3rd plural"], ["ler", "3rd plural"]
];

/** Copular person endings used after -malı / -meli. */
const COPULAR_PERSONS = [
    ["yım", "1st singular"], ["yim", "1st singular"], ["yum", "1st singular"], ["yüm", "1st singular"],
    ["sın", "2nd singular"], ["sin", "2nd singular"], ["sun", "2nd singular"], ["sün", "2nd singular"],
    ["", "3rd singular"],
    ["yız", "1st plural"], ["yiz", "1st plural"], ["yuz", "1st plural"], ["yüz", "1st plural"],
    ["sınız", "2nd plural"], ["siniz", "2nd plural"], ["lar", "3rd plural"], ["ler", "3rd plural"]
];

/** Imperative / optative endings. */
const IMPERATIVE_PERSONS = [
    ["sın", "3rd singular (let him/her/it ...)"], ["sin", "3rd singular (let him/her/it ...)"],
    ["sun", "3rd singular (let him/her/it ...)"], ["sün", "3rd singular (let him/her/it ...)"],
    ["sınlar", "3rd plural (let them ...)"], ["sinler", "3rd plural (let them ...)"],
    ["sunlar", "3rd plural (let them ...)"], ["sünler", "3rd plural (let them ...)"]
];

/**
 * Tense and mood table.
 * `bare` marks tenses whose third-person form has no person ending and may be
 * accepted without a lexicon stem (e.g. "geldi").
 */
const TENSES = [
    { id: "present-continuous", label: "Present continuous (-iyor)", markers: ["iyor", "ıyor", "uyor", "üyor", "yor"], neg: ["miyor", "mıyor", "muyor", "müyor"], persons: ASPECT_PERSONS, bare: true },
    { id: "past", label: "Definite past (-di)", markers: ["dı", "di", "du", "dü", "tı", "ti", "tu", "tü"], persons: PAST_PERSONS, bare: true },
    { id: "reported-past", label: "Reported / inferential past (-miş)", markers: ["mış", "miş", "muş", "müş"], persons: ASPECT_PERSONS, bare: true },
    { id: "future", label: "Future (-ecek)", markers: ["acak", "ecek", "acağ", "eceğ"], persons: ASPECT_PERSONS, bare: true },
    { id: "aorist", label: "Aorist / habitual (-ir)", markers: ["ar", "er", "ır", "ir", "ur", "ür", "r"], neg: ["maz", "mez"], persons: ASPECT_PERSONS, bare: false },
    { id: "necessitative", label: "Necessity (-meli)", markers: ["malı", "meli"], persons: COPULAR_PERSONS, bare: true },
    { id: "conditional", label: "Conditional (-se)", markers: ["sa", "se"], persons: PAST_PERSONS, bare: false },
    { id: "imperative", label: "Imperative / optative", markers: [], persons: IMPERATIVE_PERSONS, bare: false }
];

/** Infinitive and verbal-noun endings. */
const INFINITIVE_MARKERS = ["mak", "mek"];

/** Derivational suffixes: [suffix, category, description]. */
const DERIVATION = [
    ["sız", "adjective", "-sız: without (privative adjective)"], ["siz", "adjective", "-siz: without (privative adjective)"],
    ["suz", "adjective", "-suz: without (privative adjective)"], ["süz", "adjective", "-süz: without (privative adjective)"],
    ["lık", "noun", "-lık: forms abstract or place nouns"], ["lik", "noun", "-lik: forms abstract or place nouns"],
    ["luk", "noun", "-luk: forms abstract or place nouns"], ["lük", "noun", "-lük: forms abstract or place nouns"],
    ["cı", "noun", "-cı: agent / occupation noun"], ["ci", "noun", "-ci: agent / occupation noun"],
    ["cu", "noun", "-cu: agent / occupation noun"], ["cü", "noun", "-cü: agent / occupation noun"],
    ["çı", "noun", "-çı: agent / occupation noun"], ["çi", "noun", "-çi: agent / occupation noun"],
    ["çu", "noun", "-çu: agent / occupation noun"], ["çü", "noun", "-çü: agent / occupation noun"],
    ["laş", "verb", "-laş: becoming (verb-forming)"], ["leş", "verb", "-leş: becoming (verb-forming)"],
    ["ça", "adverb", "-ça: adverb or 'in the manner of'"], ["çe", "adverb", "-çe: adverb or 'in the manner of'"]
];

/** Nominal suffix tables, listed in the order they are stripped (case, then possession, then plural). */
const CASES = [
    ["dan", "Ablative (from)"], ["den", "Ablative (from)"], ["tan", "Ablative (from)"], ["ten", "Ablative (from)"],
    ["nın", "Genitive (of)"], ["nin", "Genitive (of)"], ["nun", "Genitive (of)"], ["nün", "Genitive (of)"],
    ["yla", "Instrumental (with)"], ["yle", "Instrumental (with)"],
    ["ya", "Dative (to)"], ["ye", "Dative (to)"], ["na", "Dative (to)"], ["ne", "Dative (to)"],
    ["yı", "Accusative (definite object)"], ["yi", "Accusative (definite object)"], ["yu", "Accusative (definite object)"], ["yü", "Accusative (definite object)"],
    ["nı", "Accusative (definite object)"], ["ni", "Accusative (definite object)"], ["nu", "Accusative (definite object)"], ["nü", "Accusative (definite object)"],
    ["da", "Locative (at / in)"], ["de", "Locative (at / in)"], ["ta", "Locative (at / in)"], ["te", "Locative (at / in)"]
];
const POSSESSIVES = [
    ["ımız", "our"], ["imiz", "our"], ["umuz", "our"], ["ümüz", "our"],
    ["ınız", "your (plural)"], ["iniz", "your (plural)"], ["unuz", "your (plural)"], ["ünüz", "your (plural)"],
    ["ım", "my"], ["im", "my"], ["um", "my"], ["üm", "my"]
];
const PLURALS = [["lar", "plural"], ["ler", "plural"]];

/** Turkish vowels grouped by harmony class. */
const BACK_VOWELS = "aıou";
const VOWELS = "aeıioöuü";

/**
 * Return the last vowel of a string, or "" when it has none.
 * @param {string} text Turkish text.
 * @returns {string} Last vowel.
 */
function lastVowel(text) {
    for (let index = text.length - 1; index >= 0; index -= 1) if (VOWELS.includes(text[index])) return text[index];
    return "";
}

/**
 * Check that the first vowel of a suffix agrees with the stem under Turkish
 * vowel harmony (2-way for a/e, 4-way for ı/i/u/ü). Fixed vowels such as the
 * "o" of -yor are not harmonic and always pass.
 * @param {string} stem Word stem.
 * @param {string} suffix Suffix being attached.
 * @returns {boolean} True when the suffix is harmonic with the stem.
 */
function harmonyOk(stem, suffix) {
    const stemVowel = lastVowel(stem);
    const suffixVowel = [...suffix].find((char) => VOWELS.includes(char));
    if (!stemVowel || !suffixVowel || suffixVowel === "o" || suffixVowel === "ö") return true;
    const back = BACK_VOWELS.includes(stemVowel);
    if ("ae".includes(suffixVowel)) return back ? suffixVowel === "a" : suffixVowel === "e";
    const rounded = "ouöü".includes(stemVowel);
    const expected = back ? (rounded ? "u" : "ı") : (rounded ? "ü" : "i");
    return suffixVowel === expected;
}

/**
 * Build the dictionary form (infinitive) for a verb stem.
 * @param {string} stem Verb stem.
 * @returns {string} Infinitive such as "gelmek".
 */
function infinitiveOf(stem) {
    return `${stem}${BACK_VOWELS.includes(lastVowel(stem)) ? "mak" : "mek"}`;
}

/**
 * Parse a finite verb form.
 * @param {string} word Lower-cased word.
 * @returns {object|null} Best candidate with stem, tense, person, polarity and confidence.
 */
function parseVerb(word) {
    let best = null;
    const consider = (candidate) => { if (!best || candidate.score > best.score) best = candidate; };

    for (const tense of TENSES) {
        const markerSets = [[tense.markers, false], [tense.neg || [], true]];
        // Imperative has no marker: the person ending attaches to the stem directly.
        const withMarkers = tense.id === "imperative" ? [[[""], false]] : markerSets;
        for (const [markers, markedNegative] of withMarkers) {
            for (const marker of markers) {
                for (const [person, personLabel] of tense.persons) {
                    const ending = marker + person;
                    if (!ending || !word.endsWith(ending) || word.length - ending.length < 2) continue;
                    let stem = word.slice(0, -ending.length);
                    let negative = markedNegative;
                    const lexical = VERB_STEMS.has(stem);

                    // Explicit negation: stem + -ma/-me before the tense marker.
                    if (!negative && !lexical && /m[ae]$/.test(stem) && stem.length > 3) {
                        const base = stem.slice(0, -2);
                        if (VERB_STEMS.has(base) || harmonyOk(base, stem.slice(-2))) { stem = base; negative = true; }
                    }
                    const inLexicon = VERB_STEMS.has(stem);
                    if (stem.length < 2 || ![...stem].some((char) => VOWELS.includes(char))) continue;
                    if (!inLexicon && !harmonyOk(stem, marker || person)) continue;
                    if (!inLexicon && person === "" && !tense.bare) continue;
                    if (!inLexicon && stem.length < 3) continue;
                    if (!inLexicon && tense.id === "aorist" && person === "") continue;

                    consider({
                        stem, tense, person: personLabel, negative, inLexicon,
                        score: (inLexicon ? 3 : 0) + (person ? 1 : 0) + ending.length * 0.1
                    });
                }
            }
        }
    }
    if (!best) return null;
    return {
        ...best,
        confidence: best.inLexicon ? 0.9 : best.person === "3rd singular" ? 0.5 : 0.65
    };
}

/**
 * Parse a nominal chain: stem + [plural] + [possessive] + [case].
 * @param {string} word Lower-cased word.
 * @returns {{stem: string, layers: string[][]}|null} Parsed chain, or null when no suffix is found.
 */
function parseNominal(word) {
    let stem = word;
    const layers = [];
    const strip = (table, name) => {
        for (const [suffix, label] of table) {
            if (stem.endsWith(suffix) && stem.length - suffix.length >= 3 && harmonyOk(stem.slice(0, -suffix.length), suffix)) {
                stem = stem.slice(0, -suffix.length);
                layers.unshift([name, `${label} (-${suffix})`]);
                return true;
            }
        }
        return false;
    };
    strip(CASES, "Case");
    strip(POSSESSIVES, "Possessive");
    strip(PLURALS, "Number");
    return layers.length ? { stem, layers } : null;
}

/** The Turkish analyzer, registered by the engine for language code "tr". */
export const turkishAnalyzer = {
    id: "turkish-morphology",
    name: "Turkish morphological analyzer",
    tier: "language-specific",
    languages: ["tr"],

    /**
     * @param {string} rawWord Word under the cursor.
     * @returns {Promise<object|null>} Partial grammar result, or null when nothing is recognised.
     */
    async analyze(rawWord) {
        const word = rawWord.toLocaleLowerCase("tr");

        // 1. Closed-class words.
        for (const [category, list] of Object.entries(CLOSED_CLASS)) {
            if (list.split(/\s+/).includes(word)) {
                const details = [["Word class", "closed-class (function) word"]];
                if (category === "particle" && (word === "de" || word === "da")) details.push(["Note", "also the locative suffix -de/-da when written attached to a noun"]);
                if (category === "preposition") details.push(["Note", "Turkish uses postpositions: they come after the word they govern"]);
                return { category, confidence: 0.92, details };
            }
        }

        // 2. Infinitive (dictionary form of a verb).
        for (const marker of INFINITIVE_MARKERS) {
            const stem = word.slice(0, -marker.length);
            if (word.endsWith(marker) && stem.length >= 2 && (VERB_STEMS.has(stem) || harmonyOk(stem, marker))) {
                return {
                    category: "verb", confidence: VERB_STEMS.has(stem) ? 0.9 : 0.6, lemma: word,
                    details: [["Form", "infinitive (-mak / -mek)"], ["Stem", `${stem}-`]]
                };
            }
        }

        // 3. Finite verb forms.
        const verb = parseVerb(word);
        if (verb) {
            const details = [
                ["Stem", `${verb.stem}-`],
                ["Dictionary form", infinitiveOf(verb.stem)],
                ["Tense / mood", verb.tense.label],
                ["Person", verb.person],
                ["Polarity", verb.negative ? "negative" : "positive"]
            ];
            if (!verb.inLexicon) details.push(["Basis", "suffix parsing; the stem is not in the built-in verb list"]);
            return { category: "verb", confidence: verb.confidence, lemma: infinitiveOf(verb.stem), details };
        }

        // 4. Derivational suffixes.
        for (const [suffix, category, description] of DERIVATION) {
            const stem = word.slice(0, -suffix.length);
            if (word.endsWith(suffix) && stem.length >= 3 && harmonyOk(stem, suffix)) {
                return {
                    category, confidence: 0.5,
                    details: [["Derivation", description], ["Stem", stem], ["Basis", "suffix pattern (not verified in a dictionary)"]]
                };
            }
        }

        // 5. Nominal inflection.
        const nominal = parseNominal(word);
        if (nominal) {
            return {
                category: "noun", confidence: 0.4, lemma: nominal.stem,
                details: [["Stem", nominal.stem], ...nominal.layers, ["Basis", "noun-like suffix chain; could also be an adjective"]]
            };
        }
        return null;
    }
};
