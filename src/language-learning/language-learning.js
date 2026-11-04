/**
 * Charlie MJ Language Learning — v1.0.0
 *
 * Provides an independent language-learning workspace backed by the Reader's
 * existing local-first storage. Saved vocabulary is written to the shared
 * vocabulary collection so it remains visible in the original Vocabulary tab.
 *
 * Grammar highlighting in this version is a transparent, lightweight heuristic.
 * It is an aid for reading, not a substitute for a language-specific NLP parser.
 */
import { getAll, saveAll, makeId } from "../lib/storage.js";
import { saveArticleFromUrl } from "../lib/sites.js";
import {
    installArticleBehaviours,
    renderArticleDetails,
    renderOriginalArticleHeader,
    stripPublisherChrome
} from "../lib/article-header.js";
import { installHoverGrammar } from "../lib/language-engine/hover-grammar.js";
const view = document.getElementById("learning-view");
const heading = document.getElementById("page-heading");
const subtitle = document.getElementById("page-subtitle");
const levelSelect = document.getElementById("learner-level");
const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const GRAMMAR_TYPES = [
    "noun",
    "verb",
    "pronoun",
    "adjective",
    "adverb",
    "conjunction",
    "preposition",
    "article",
    "suffix",
    "determiner", "tense", "case", "clause", "sentence-structure", "morphology",
    "modal", "conditional", "passive-voice", "reported-speech", "gerund",
    "infinitive", "collocation", "idiom", "phrasal-verb", "prefix", "punctuation", "conversation"
];
const GRAMMAR_LABELS = {
    noun: "Nouns",
    verb: "Verbs",
    pronoun: "Pronouns",
    adjective: "Adjectives",
    adverb: "Adverbs",
    conjunction: "Conjunctions",
    preposition: "Prepositions",
    article: "Articles",
    suffix: "Suffixes",
    determiner: "Determiners", tense: "Tenses", case: "Cases", clause: "Clauses",
    "sentence-structure": "Sentence structure", morphology: "Morphology",
    modal: "Modal verbs", conditional: "Conditionals", "passive-voice": "Passive voice",
    "reported-speech": "Reported speech", gerund: "Gerunds", infinitive: "Infinitives",
    collocation: "Collocations", idiom: "Idioms", "phrasal-verb": "Phrasal verbs",
    prefix: "Prefixes", punctuation: "Punctuation"
};
const COMMON_WORDS = new Set(`a an the and or but if although because while when where who whom whose
   which that this these those i you he she it we they me him her us them
   my your his its our their am is are was were be been being have has had
   do does did can could may might must shall should will would in on at by
   for from to of with about under over between through after before as than
   very more most less not no yes so too also just`.split(/\s+/));
const PRONOUNS = new Set(`i me my mine myself we us our ours ourselves you your yours yourself
   yourselves he him his himself she her hers herself it its itself they
   them their theirs themselves who whom whose which that this these those`.split(/\s+/));
const PREPOSITIONS = new Set(`about above across after against along among around as at before behind
   below beneath beside between beyond but by despite down during except for
   from in inside into like near of off on onto opposite out outside over
   past per since through throughout till to toward under underneath until
   up upon via with within without`.split(/\s+/));
const CONJUNCTIONS = new Set(`and but or nor for yet so although because since unless until while whereas
   whether though if once than`.split(/\s+/));
const ADJECTIVE_SUFFIXES = ["able", "ible", "al", "ful", "ic", "ive", "less", "ous"];
const ADVERB_SUFFIXES = ["ly"];
const VERB_SUFFIXES = ["ing", "ed", "ize", "ise", "ify"];
const NOUN_SUFFIXES = ["ness", "ment", "tion", "sion", "ity", "ship", "ance", "ence"];
let data = await getAll();
let currentView = "overview";
let activeArticle = null;
let selectedToken = null;
let enabledGrammar = new Set(GRAMMAR_TYPES);
let toastTimer = null;
data.languageLearning = data.languageLearning || {
    version: 1,
    items: [],
    grammar: [],
    progress: { articlesRead: 0, studyMinutes: 0, lastStudyAt: null },
    settings: { learnerLevel: "B1", targetLanguage: "en" }
};
data.languageLearning.items = Array.isArray(data.languageLearning.items)
    ? data.languageLearning.items
    : [];
data.languageLearning.grammar = Array.isArray(data.languageLearning.grammar)
    ? data.languageLearning.grammar
    : [];
data.languageLearning.settings = {
    learnerLevel: "B1",
    targetLanguage: "en",
    targetLevel: "B2",
    dailyGoalMinutes: 15,
    revisionReminders: true,
    grammarColors: {},
    grammarStyles: {},
    fontFamily: "system-ui",
    fontSize: 17,
    highlightStyle: "soft",
    activityDates: [],
    ...(data.languageLearning.settings || {})
};
levelSelect.value = data.languageLearning.settings?.learnerLevel || "B1";
/** Escape untrusted text before inserting it into extension-owned HTML. */
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}
/** Persist the shared Reader database and the Language Learning module data. */
async function persist() {
    await saveAll(data);
}
/** Display a short, accessible status message. */
function notify(message) {
    const toast = document.getElementById("learning-toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}
/** Return an article's plain text without changing the saved article record. */
function articleText(article) {
    if (!article)
        return "";
    if (article.text)
        return String(article.text);
    const parsed = new DOMParser().parseFromString(article.html || "", "text/html");
    return parsed.body.textContent || "";
}
// Shared behaviours: avatar fallbacks, hidden broken thumbnails, description toggle.
installArticleBehaviours();


/** Return learning-marked articles from the single shared Reader article store. */
function getLearningArticles() {
    const learningDomains = new Set((data.settings.websites || [])
        .filter((site) => site.languageLearning === true)
        .map((site) => String(site.domain || "").replace(/^www\./i, "").toLowerCase()));

    return (data.articles || []).filter((article) => {
        const domain = String(article.domain || "").replace(/^www\./i, "").toLowerCase();
        return article.languageLearning === true || learningDomains.has(domain);
    });
}
/** Estimate a CEFR reading band from text length and lexical complexity. */
function estimateLevel(text) {
    const words = text.match(/\b[\p{L}'-]+\b/gu) || [];
    if (!words.length)
        return "A1";
    const longWords = words.filter((word) => word.length >= 9).length;
    const longRatio = longWords / words.length;
    const averageSentence = words.length / Math.max(1, (text.match(/[.!?]+/g) || []).length);
    if (longRatio > 0.2 || averageSentence > 24)
        return "C1";
    if (longRatio > 0.14 || averageSentence > 19)
        return "B2";
    if (longRatio > 0.09 || averageSentence > 15)
        return "B1";
    if (longRatio > 0.05 || averageSentence > 10)
        return "A2";
    return "A1";
}
/**
 * Analyze a token using language-specific lightweight morphology.
 * This is deliberately conservative: without a trained contextual NLP model,
 * uncertain words remain unclassified instead of being mislabeled as nouns.
 */
function classifyWord(rawWord) {
    const rawLanguage = String(activeArticle?.language || activeArticle?.lang || data.languageLearning.settings.targetLanguage || "en").toLowerCase();
    const languageAliases = { turkish: "tr", tur: "tr", urdu: "ur", urd: "ur", english: "en", eng: "en" };
    const language = languageAliases[rawLanguage] || rawLanguage.split("-")[0];
    const word = String(rawWord || "").toLocaleLowerCase(language).replace(/^[^\p{L}]+|[^\p{L}'-]+$/gu, "");
    if (!word) return null;

    if (language === "tr" || language === "tur") {
        const turkishPronouns = new Set("ben sen o biz siz onlar bu şu kim ne kendi".split(" "));
        const turkishConjunctions = new Set("ve ama fakat çünkü veya ya da ancak".split(" "));
        const turkishPostpositions = new Set("için gibi kadar göre rağmen dolayı üzere".split(" "));
        if (turkishPronouns.has(word)) return "pronoun";
        if (turkishConjunctions.has(word)) return "conjunction";
        if (turkishPostpositions.has(word)) return "preposition";
        // Common Turkish finite-verb and participle inflection endings.
        const turkishVerbLexicon = new Set("olmak olsun olur oldu olan olanı olmuştur olmalı olsaydı olacağım etmek etmekte etti eder etmekten yapmak yapıyor yaptı yapmakta gelmek geliyor geldi gelecek gitmek gidiyor gitti demek dedi der görmek görüyor gördü bilmek biliyor bildi istemek istiyor istedi konuşmak konuşuyor konuştu öğrenmek öğreniyor öğrendi okumak okuyor okudu yazmak yazıyor yazdı anlamak anlıyor anladı söylemek söylüyor söyledi başlamak başladı başlıyor bitirmek bitirdi bitiyor yaşamak yaşıyor yaşadı sevmek seviyor sevdi kullanmak kullanıyor kullandı kalmak kaldı kalıyor vermek verdi veriyor almak aldı alıyor bulmak buldu buluyor".split(" "));
        if (turkishVerbLexicon.has(word)) return "verb";
        const verbEndings = [
            "yorsunuz", "iyorsunuz", "ıyorsunuz", "uyorsunuz", "üyorsunuz", "iyorsun", "ıyorsun", "uyorsun", "üyorsun",
            "yorum", "ıyorum", "uyorum", "üyorum", "yoruz", "ıyoruz", "uyoruz", "üyoruz", "iyor", "ıyor", "uyor", "üyor",
            "mışlar", "mişler", "muşlar", "müşler", "mışım", "mişim",
            "acaklar", "ecekler", "acağım", "eceğim", "acak", "ecek",
            "dılar", "diler", "tılar", "tiler", "dı", "di", "du", "dü", "tı", "ti", "tu", "tü",
            "malı", "meli", "mak", "mek", "ınız", "iniz", "unuz", "ünüz", "sun", "sün", "sin", "sın"
        ];
        if (verbEndings.some((ending) => word.length > ending.length + 1 && word.endsWith(ending))) return "verb";
        // Turkish derivational and inflectional suffixes are exposed as morphology.
        const suffixes = ["lık", "lik", "luk", "lük", "cı", "ci", "cu", "cü", "sız", "siz", "suz", "süz", "laş", "leş"];
        if (suffixes.some((ending) => word.length > ending.length + 2 && word.endsWith(ending))) return "suffix";
        return null;
    }

    if (language === "ur" || language === "urd") {
        const urduPronouns = new Set("میں ہم تم آپ یہ وہ اسے انہیں مجھے تجھے".split(" "));
        if (urduPronouns.has(word)) return "pronoun";
        // Urdu verb forms often contain auxiliary/inflection markers; avoid
        // asserting a POS from suffixes alone when the form is ambiguous.
        if (["رہا", "رہی", "رہے", "تا", "تی", "تے", "گا", "گی", "گے", "چکا", "چکی", "چکے"].some((ending) => word.endsWith(ending))) return "verb";
        return null;
    }

    if (language !== "en" && language !== "eng") return null;
    if (PRONOUNS.has(word)) return "pronoun";
    if (CONJUNCTIONS.has(word)) return "conjunction";
    if (PREPOSITIONS.has(word)) return "preposition";
    if (["a", "an", "the"].includes(word)) return "article";
    if (ADVERB_SUFFIXES.some((suffix) => word.endsWith(suffix)) && word.length > 4) return "adverb";
    if (ADJECTIVE_SUFFIXES.some((suffix) => word.endsWith(suffix)) && word.length > 4) return "adjective";
    if (VERB_SUFFIXES.some((suffix) => word.endsWith(suffix)) && word.length > 4) return "verb";
    if (NOUN_SUFFIXES.some((suffix) => word.endsWith(suffix)) && word.length > 5) return "suffix";
    if (/^(is|are|was|were|be|been|being|have|has|had|do|does|did|go|goes|went|make|made|take|took|decide|decided|work|worked|read|reads|write|wrote|said|say|says|run|ran|learn|learned|learning)$/i.test(word)) return "verb";
    return null;
}
/** Return the default color for a grammar category. */
function defaultGrammarColor(type) {
    const colors = {
        noun: "#80b5ff",
        verb: "#72dda9",
        pronoun: "#70d7e8",
        adjective: "#c3a0ff",
        adverb: "#ffb36b",
        conjunction: "#f4d477",
        preposition: "#65d4c0",
        article: "#c2c9d9",
        suffix: "#9b8aff",
        determiner: "#9fc5ff", tense: "#7fd8a8", case: "#79cbd8",
        clause: "#d5a0ff", "sentence-structure": "#f1ca75", morphology: "#b1a0ff",
        modal: "#83d8c7", conditional: "#e7a2b7", "passive-voice": "#9ab5ee",
        "reported-speech": "#d9b27a", gerund: "#83c5a2", infinitive: "#83a8d8",
        collocation: "#e6a6d0", idiom: "#ef9fc2", "phrasal-verb": "#e5b77d",
        prefix: "#a99aff", punctuation: "#aab4c8"
    };
    return colors[type] || "#ffffff";
}
/** Build highlighted article text while preserving paragraph boundaries. */
function highlightText(text) {
    const paragraphs = String(text || "")
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
    return paragraphs.map((paragraph) => {
        const tokenLanguage = activeArticle?.language || activeArticle?.lang || data.languageLearning.settings.targetLanguage || "en";
        const parts = paragraph.split(/(\s+)/);
        const tokens = parts.map((part) => {
            if (!part.trim())
                return escapeHtml(part);
            const category = classifyWord(part);
            const word = part.replace(/^[^\p{L}]+|[^\p{L}'-]+$/gu, "");
            if (!category || !enabledGrammar.has(category))
                return escapeHtml(part);
            const savedColor = data.languageLearning.settings?.grammarColors?.[category];
            const color = /^#[0-9a-f]{6}$/i.test(savedColor || "") ? savedColor : defaultGrammarColor(category);
            const style = data.languageLearning.settings?.grammarStyles?.[category] || "normal";
            const fontFamily = data.languageLearning.settings?.grammarFonts?.[category] || "inherit";
            const background = data.languageLearning.settings?.grammarBackgrounds?.[category] || "";
            const decoration = style === "underline" ? "text-decoration:underline" : style === "italic" ? "font-style:italic" : style === "bold" ? "font-weight:800" : "";
            const backgroundStyle = /^#[0-9a-f]{6}$/i.test(background) ? `background-color:${background};` : "";
            return `<span class="learning-token grammar-${category}" style="color:${color};--grammar-color:${color};font-family:${fontFamily};${backgroundStyle}${decoration}" data-word="${escapeHtml(word)}" data-language="${escapeHtml(tokenLanguage)}" data-type="${category}" title="${GRAMMAR_LABELS[category]}">${escapeHtml(part)}</span>`;
        });
        return `<p>${tokens.join("")}</p>`;
    }).join("");
}
/**
 * Highlight a text node without interpreting it as HTML.
 * The original article's safe semantic structure is rebuilt separately.
 */
function highlightInlineText(text) {
    const tokenLanguage = activeArticle?.language || activeArticle?.lang || data.languageLearning.settings.targetLanguage || "en";
    return String(text).split(/(\s+)/).map((part) => {
        if (!part.trim())
            return escapeHtml(part);
        const category = classifyWord(part);
        const word = part.replace(/^[^\p{L}]+|[^\p{L}'-]+$/gu, "");
        if (!category || !enabledGrammar.has(category))
            return escapeHtml(part);
        const savedColor = data.languageLearning.settings?.grammarColors?.[category];
        const color = /^#[0-9a-f]{6}$/i.test(savedColor || "") ? savedColor : defaultGrammarColor(category);
        const style = data.languageLearning.settings?.grammarStyles?.[category] || "normal";
        const fontFamily = data.languageLearning.settings?.grammarFonts?.[category] || "inherit";
        const background = data.languageLearning.settings?.grammarBackgrounds?.[category] || "";
        const decoration = style === "underline" ? "text-decoration:underline" : style === "italic" ? "font-style:italic" : style === "bold" ? "font-weight:800" : "";
        const backgroundStyle = /^#[0-9a-f]{6}$/i.test(background) ? `background-color:${background};` : "";
        return `<span class="learning-token grammar-${category}" style="color:${color};--grammar-color:${color};font-family:${fontFamily};${backgroundStyle}${decoration}" data-word="${escapeHtml(word)}" data-language="${escapeHtml(tokenLanguage)}" data-type="${category}" title="${GRAMMAR_LABELS[category]}">${escapeHtml(part)}</span>`;
    }).join("");
}
/**
 * Rebuild saved article markup from a strict element allow-list.
 * This keeps headings, lists, emphasis, quotations, links and images while
 * preventing executable markup or unsafe URL schemes from entering the page.
 */
function renderSafeArticleMarkup(article) {
    const source = String(article?.html || "").trim();
    if (!source)
        return highlightText(articleText(article));
    const parsed = new DOMParser().parseFromString(source, "text/html");
    // Section 1 and the Section 2 header already show the title, subtitle,
    // lead image, author and date, so remove those duplicates from the body.
    stripPublisherChrome(parsed.body, article);
    const allowedTags = new Set([
        "P", "H1", "H2", "H3", "H4", "UL", "OL", "LI", "STRONG", "B",
        "EM", "I", "BLOCKQUOTE", "PRE", "CODE", "BR", "HR", "A",
        "FIGURE", "FIGCAPTION", "IMG"
    ]);
    function rebuild(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return highlightInlineText(node.nodeValue || "");
        }
        if (node.nodeType !== Node.ELEMENT_NODE)
            return "";
        const tag = node.tagName;
        // Publisher bylines are already rendered once in the shared article
        // masthead. Remove duplicate author/date widgets embedded in body HTML.
        const publisherMeta = `${node.id || ""} ${node.className?.baseVal || node.className || ""} ${node.getAttribute?.("itemprop") || ""}`.toLowerCase();
        if (/(^|[-_\s])(author|byline|post-meta|article-meta|published|publication-info|writer-profile)([-_\s]|$)/.test(publisherMeta)
            && !["H1", "H2", "H3", "H4", "P", "A", "IMG"].includes(tag)) {
            return "";
        }
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT"].includes(tag)) {
            return "";
        }
        if (!allowedTags.has(tag)) {
            return [...node.childNodes].map(rebuild).join("");
        }
        if (tag === "IMG") {
            const rawSource = node.getAttribute("src") || "";
            try {
                const imageUrl = new URL(rawSource, article.url || location.href);
                if (!["http:", "https:"].includes(imageUrl.protocol))
                    return "";
                return `<img src="${escapeHtml(imageUrl.href)}" alt="${escapeHtml(node.getAttribute("alt") || "")}" loading="lazy">`;
            }
            catch {
                return "";
            }
        }
        if (tag === "A") {
            const rawHref = node.getAttribute("href") || "";
            let safeHref = "";
            try {
                const parsedUrl = new URL(rawHref, article.url || location.href);
                if (["http:", "https:"].includes(parsedUrl.protocol))
                    safeHref = parsedUrl.href;
            }
            catch {
                safeHref = "";
            }
            const content = [...node.childNodes].map(rebuild).join("");
            return safeHref
                ? `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${content}</a>`
                : content;
        }
        const content = [...node.childNodes].map(rebuild).join("");
        return `<${tag.toLowerCase()}>${content}</${tag.toLowerCase()}>`;
    }
    return [...parsed.body.childNodes].map(rebuild).join("");
}
/** Return the saved learning records matching a category. */
function learningItems(type) {
    return data.languageLearning.items.filter((item) => item.type === type);
}
/** Create a reusable article card linked to the original saved article. */
function articleCard(article) {
    const text = articleText(article);
    const words = (text.match(/\b[\p{L}'-]+\b/gu) || []).length;
    const level = estimateLevel(text);
    const thumbnail = article.thumbnail || article.image || "";
    const logo = article.logo || article.favicon || "";
    return `
    <article class="article-card">
      ${thumbnail ? `<img class="learning-card-thumbnail" src="${escapeHtml(thumbnail)}" alt="Article thumbnail" loading="lazy" referrerpolicy="no-referrer">` : `<div class="learning-card-thumbnail learning-card-placeholder">Article preview unavailable</div>`}
      <div class="article-meta">
        <span class="pill">${escapeHtml(level)} estimated</span>
        <span class="pill">${words.toLocaleString()} words</span>
      </div>
      <h3>${escapeHtml(article.title || "Untitled article")}</h3>
      <p>${escapeHtml(article.description || article.domain || article.url || "Saved Reader article")}</p>
      <div class="article-meta">
        <span>${logo ? `<img class="learning-card-logo" src="${escapeHtml(logo)}" alt="">` : ""}${escapeHtml(article.siteName || article.domain || "Saved article")}</span>
        <span>${escapeHtml(article.author || "Author unavailable")}</span>
        <span>${escapeHtml(article.publishedAt || article.date || "Date unavailable")}</span>
        <span>${Math.round(article.progress || 0)}% read</span>
      </div>
      <div class="list-item-actions">
        <button class="button button-primary" data-open-article="${escapeHtml(article.id)}">Open learning reader</button>
        <button class="button" data-learning-details="${escapeHtml(article.id)}">Article Details</button>
        <button class="button" data-refresh-learning-article="${escapeHtml(article.id)}">↻ Refresh & Fetch</button>
      </div>
    </article>`;
}
/** Render the Language Learning overview with live counts from shared storage. */
function renderOverview() {
    heading.textContent = "Language Learning";
    subtitle.textContent = "Turn real-world articles into practical language lessons.";
    const learningArticles = getLearningArticles();
    const vocabCount = data.vocabulary.length;
    const sentenceCount = learningItems("sentence").length;
    const grammarCount = data.languageLearning.grammar.length;
    const expressionCount = data.languageLearning.items.filter((item) => ["idiom", "phrase", "slang", "proverb"].includes(item.type)).length;
    view.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">\
<strong>${learningArticles.length}</strong>\
<span>Saved learning articles</span>\
</div>
      <div class="stat-card">\
<strong>${vocabCount}</strong>\
<span>Shared vocabulary records</span>\
</div>
      <div class="stat-card">\
<strong>${grammarCount}</strong>\
<span>Saved grammar notes</span>\
</div>
      <div class="stat-card">\
<strong>${sentenceCount + expressionCount}</strong>\
<span>Sentences & expressions</span>\
</div>
    </div>
    <div class="section-heading">
      <h2>Learning Tools</h2>
      <button class="button" data-view-link="settings">Customize tools</button>
    </div>
    <div class="content-grid">
      <div class="card">
        <h3>Grammar categories</h3>
        <p class="muted">Toggle the structures you want to see while reading.</p>
        <div class="legend">${GRAMMAR_TYPES.map((type) => `<label><input type="checkbox" data-grammar-toggle="${type}" checked> ${GRAMMAR_LABELS[type]}</label>`).join("")}</div>
        <button class="button button-primary" data-view-link="articles">Open Learning Articles</button>
      </div>
      <div class="card">
        <h3>Shared Reader Vocabulary</h3>
        <p class="muted">The same vocabulary records are used by Reader Workspace and Language Learning.</p>
        <button class="button" data-view-link="vocabulary">Review Vocabulary (${vocabCount})</button>
      </div>
      <div class="card">
        <h3>Review Vocabulary</h3>
        <p class="muted">Revisit words you have already saved and strengthen recall.</p>
        <button class="button" data-view-link="vocabulary">Start review</button>
      </div>
    </div>
    <div class="section-heading">
      <h2>Continue Learning</h2>
      <button class="button" data-view-link="articles">View all articles →</button>
    </div>
    ${learningArticles.length
            ? `<div class="article-grid">${learningArticles.slice(0, 6).map(articleCard).join("")}</div>`
            : `<div class="empty-state">Your article library is empty. Open a supported website and choose “Learn from current page”.</div>`}`;
}
/** Render all saved articles from the existing Reader article database. */
function renderArticles() {
    heading.textContent = "Learning Articles";
    subtitle.textContent = "Use your existing saved articles as language-learning material.";
    view.innerHTML = `
    <div class="toolbar">
      <input class="field" id="article-search" placeholder="Search saved articles…" aria-label="Search saved articles">
      <button class="button" id="capture-from-articles">＋ Capture current page</button>
    </div>
    <div class="article-grid" id="learning-articles">
      ${getLearningArticles().length
            ? getLearningArticles().map(articleCard).join("")
            : `<div class="empty-state">No saved articles yet. Capture a supported article to begin learning.</div>`}
    </div>`;
}
/** Render shared vocabulary records, including words saved in this module. */
function renderVocabulary() {
    heading.textContent = "Vocabulary Library";
    subtitle.textContent = "One organized library for every saved word, sentence, expression, conversation and grammar resource.";
    const groups = [
        ["Vocabulary", data.vocabulary],
        ["Saved Sentences", learningItems("sentence")],
        ["Phrases", learningItems("phrase")],
        ["Idioms", learningItems("idiom")],
        ["Slang", learningItems("slang")],
        ["Expressions & Proverbs", data.languageLearning.items.filter((item) => ["expression", "proverb", "collocation", "phrasal-verb"].includes(item.type))],
        ["Conversations & Passages", learningItems("conversation")],
        ["Grammar Notes & Rules", data.languageLearning.grammar]
    ];
    view.innerHTML = `
      <div class="toolbar"><input class="field" id="item-search" placeholder="Search your saved learning library…"><button class="button" id="export-learning">Export Library</button></div>
      <div class="vocabulary-category-grid">${groups.map(([name, records]) => `
        <section class="card vocabulary-category-card"><div class="vocabulary-category-head"><h3>${escapeHtml(name)}</h3><span class="pill">${records.length}</span></div>
          <div class="vocabulary-record-list">${records.map((item) => `<article class="vocabulary-record"><strong>${escapeHtml(item.word || item.originalText || item.title || item.text || "Saved item")}</strong><p>${escapeHtml(item.definition || item.translation || item.notes || item.explanation || "No description added.")}</p></article>`).join("") || `<p class="muted">No ${escapeHtml(name.toLowerCase())} saved yet.</p>`}</div>
        </section>`).join("")}</div>`;
}
/** Render bookmarks from the shared Reader bookmark collection. */
function renderBookmarks() {
    heading.textContent = "Bookmarks";
    subtitle.textContent = "Saved reading positions and learning passages.";
    const records = Array.isArray(data.bookmarks) ? data.bookmarks : [];
    view.innerHTML = `<div class="toolbar"><button class="button" id="export-bookmarks">Export bookmarks JSON</button></div><div class="vocabulary-category-grid">${records.map((item) => `<article class="card"><h3>${escapeHtml(item.title || "Reading bookmark")}</h3><p>${escapeHtml(item.text || "")}</p><p class="muted">${escapeHtml(item.url || "")} · ${escapeHtml(item.createdAt || "")}</p></article>`).join("") || `<div class="empty-state">No bookmarks saved yet.</div>`}</div>`;
}
/** Render grammar notes saved from selected article text. */
function renderGrammar() {
    heading.textContent = "Grammar Collection";
    subtitle.textContent = "Review grammar observations saved while reading.";
    const records = data.languageLearning.grammar;
    view.innerHTML = `
    <div class="toolbar">
      <button class="button" id="grammar-export">Export grammar notes</button>
    </div>
    <div class="list">
      ${records.length ? records.map((item) => `
        <article class="list-item">
          <strong>${escapeHtml(item.title || item.text || "Grammar note")}</strong>
          <p>${escapeHtml(item.explanation || item.text || "")}</p>
          <div class="article-meta">\
<span>${escapeHtml(item.cefrLevel || "Unrated")}</span>\
<span>${escapeHtml(item.articleTitle || "General note")}</span>\
<span>${item.mastered ? "Mastered" : "In progress"}</span>\
</div>
          <button class="button" data-master-grammar="${escapeHtml(item.id)}">${item.mastered ? "Mark in progress" : "Mark mastered"}</button>
        </article>`).join("") : `<div class="empty-state">No grammar notes saved. Open an article, select a sentence or phrase, and save it as a grammar note.</div>`}
    </div>`;
}
/** Render sentence records saved from article selections. */
function renderSentences() {
    heading.textContent = "Saved Sentences";
    subtitle.textContent = "Collect complete sentences and revisit them later.";
    renderItemCollection("sentence", "No saved sentences yet.");
}
/** Render idioms, phrases, slang and proverbs together. */
function renderExpressions() {
    heading.textContent = "Expressions";
    subtitle.textContent = "Your saved idioms, phrases, slang and proverbs.";
    const records = data.languageLearning.items.filter((item) => ["idiom", "phrase", "slang", "proverb"].includes(item.type));
    renderRecords(records, "No expressions saved yet.");
}
/** Render a type-specific learning collection. */
function renderItemCollection(type, emptyMessage) {
    renderRecords(learningItems(type), emptyMessage);
}
/** Render learning records without duplicating their storage. */
function renderRecords(records, emptyMessage) {
    view.innerHTML = `<div class="list">
    ${records.length ? records.map((item) => `
      <article class="list-item">
        <strong>${escapeHtml(item.originalText || item.text || item.title || "Learning item")}</strong>
        <p>${escapeHtml(item.definition || item.translation || item.notes || item.explanation || "")}</p>
        <div class="article-meta">\
<span>${escapeHtml(item.type || "item")}</span>\
<span>${escapeHtml(item.cefrLevel || "Unrated")}</span>\
</div>
      </article>`).join("") : `<div class="empty-state">${emptyMessage}</div>`}
  </div>`;
}
/** Populate recommended font stacks for the selected writing system. */
async function populateLanguageFonts() {
    const select = document.getElementById("learning-font-family");
    if (!select) return;
    try {
        const response = await fetch(chrome.runtime.getURL("src/database/font-registry.json"));
        if (!response.ok) throw new Error("Font registry unavailable.");
        const registry = await response.json();
        const language = String(data.languageLearning.settings.targetLanguage || "en").toLowerCase().split("-")[0];
        const entry = registry.languages?.[language] || registry.languageFallbacks?.[language];
        const families = [...new Set([
            ...(registry.genericFamilies || ["system-ui", "sans-serif", "serif"]),
            ...(entry?.families || []),
            "Georgia", "Arial", "Inter", "Noto Sans"
        ])];
        const current = data.languageLearning.settings.fontFamily || "system-ui";
        select.innerHTML = families.map((font) => `<option value="${escapeHtml(font)}" ${font === current ? "selected" : ""}>${escapeHtml(font)}</option>`).join("");
    } catch (error) {
        console.warn("Charlie MJ Reader: font registry could not be loaded.", error);
    }
}
/** Populate language choices from the bundled ISO 639 registry. */
async function populateLanguageRegistry() {
    const selects = [document.getElementById("target-language"), document.getElementById("learning-target-language")].filter(Boolean);
    if (!selects.length) return;
    try {
        const response = await fetch(chrome.runtime.getURL("src/database/languages.json"));
        if (!response.ok) throw new Error("Language registry could not be loaded.");
        const registry = await response.json();
        const selected = data.languageLearning.settings.targetLanguage || "en";
        const options = [...registry.languages].sort((a, b) => Number(Boolean(b.commonSelectable)) - Number(Boolean(a.commonSelectable)) || a.name.localeCompare(b.name)).map((language) => {
            const code = language.alpha2 || language.alpha3;
            return `<option value="${escapeHtml(code)}" ${code === selected ? "selected" : ""}>${escapeHtml(language.name)} (${escapeHtml(code)})</option>`;
        }).join("");
        for (const select of selects) select.innerHTML = options;
        const search = document.getElementById("target-language-search");
        search?.addEventListener("input", () => {
            const query = search.value.trim().toLocaleLowerCase();
            const filtered = [...registry.languages].filter((language) => {
                const code = language.alpha2 || language.alpha3 || "";
                return [language.name, language.nativeName, language.alpha2, language.alpha3, language.bibliographic, language.terminologic]
                    .filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(query));
            }).sort((a, b) => Number(Boolean(b.commonSelectable)) - Number(Boolean(a.commonSelectable)) || a.name.localeCompare(b.name));
            const target = document.getElementById("target-language");
            if (!target) return;
            const selected = data.languageLearning.settings.targetLanguage || "en";
            target.innerHTML = filtered.map((language) => {
                const code = language.alpha2 || language.alpha3;
                return `<option value="${escapeHtml(code)}" ${code === selected ? "selected" : ""}>${escapeHtml(language.name)}${language.nativeName ? ` · ${escapeHtml(language.nativeName)}` : ""} (${escapeHtml(code)})</option>`;
            }).join("") || `<option value="">No matching languages</option>`;
        });
    } catch (error) {
        notify(error.message || "Language list unavailable.");
    }
}
/** Render grammar appearance and target-language preferences. */
function renderSettings() {
    heading.textContent = "Learning Settings";
    subtitle.textContent = "Customize grammar colors and your preferred learning language.";
    const colors = data.languageLearning.settings.grammarColors || {};
    view.innerHTML = `
        <div class="card">
            <h2>Grammar highlight colors</h2>
            <p class="muted">Choose a color for each grammar category. Preferences are stored locally.</p>
            <div class="settings-grid">
                ${GRAMMAR_TYPES.map((type) => `
                    <label class="color-setting">
                        <span>${GRAMMAR_LABELS[type]}</span>
                        <input type="color" value="${escapeHtml(colors[type] || defaultGrammarColor(type))}" data-grammar-color="${type}" aria-label="${GRAMMAR_LABELS[type]} text color">
                        <input type="color" value="${escapeHtml(data.languageLearning.settings.grammarBackgrounds?.[type] || "#24314a")}" data-grammar-background="${type}" aria-label="${GRAMMAR_LABELS[type]} highlight color">
                        <select data-grammar-font="${type}" aria-label="${GRAMMAR_LABELS[type]} font family">
                          ${["inherit", "system-ui", "Georgia", "Arial", "Inter", "Noto Sans", "Noto Sans Arabic", "Noto Naskh Arabic", "Noto Nastaliq Urdu", "Noto Sans Devanagari", "Noto Sans CJK", "Noto Sans Thai", "Noto Sans Hebrew"].map((font) => `<option value="${font}" ${(data.languageLearning.settings.grammarFonts?.[type] || "inherit") === font ? "selected" : ""}>${font}</option>`).join("")}
                        </select>
                        <select data-grammar-style="${type}" aria-label="${GRAMMAR_LABELS[type]} text style">
                          ${["normal", "bold", "italic", "underline"].map((style) => `<option value="${style}" ${(data.languageLearning.settings.grammarStyles?.[type] || "normal") === style ? "selected" : ""}>${style}</option>`).join("")}
                        </select>
                    </label>`).join("")}
            </div>
            <div class="settings-grid learning-preference-grid">
              <label class="color-setting"><span>Reader font</span><select id="learning-font-family"><option value="system-ui">System</option><option value="Georgia">Georgia</option><option value="Arial">Arial</option><option value="Inter">Inter</option><option value="Noto Nastaliq Urdu">Noto Nastaliq Urdu</option><option value="Noto Naskh Arabic">Noto Naskh Arabic</option><option value="Noto Sans Arabic">Noto Sans Arabic</option><option value="Noto Sans Devanagari">Noto Sans Devanagari</option><option value="Noto Sans CJK">Noto Sans CJK</option></select></label>
              <label class="color-setting"><span>Font size</span><input id="learning-font-size" type="number" min="12" max="32" value="${Number(data.languageLearning.settings.fontSize || 17)}"></label>
              <label class="color-setting"><span>Highlight appearance</span><select id="learning-highlight-style"><option value="soft">Soft background</option><option value="underline">Underline</option><option value="text">Text color only</option></select></label>
            </div>
        </div>
        <div class="card" style="margin-top:14px">
            <h2>Article typography</h2>
            <p class="muted">Choose independent font families and sizes for each article element.</p>
            <div class="settings-grid learning-typography-grid">
              ${[["title","Article title"],["subtitle","Subtitle"],["description","Description"],["heading","Headings"],["subheading","Subheadings"],["quote","Quotes"],["body","Article body"]].map(([key,label]) => `<label class="color-setting"><span>${label}</span><select data-article-font="${key}"><option value="inherit">Theme default</option><option value="system-ui">System UI</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Inter">Inter</option><option value="Noto Sans">Noto Sans</option><option value="Noto Naskh Arabic">Noto Naskh Arabic</option><option value="Noto Nastaliq Urdu">Noto Nastaliq Urdu</option><option value="Noto Sans Arabic">Noto Sans Arabic</option><option value="Noto Sans Devanagari">Noto Sans Devanagari</option></select><input type="number" min="10" max="64" value="${Number(data.languageLearning.settings.articleTypography?.[key]?.size || (key === "title" ? 34 : key === "body" ? 17 : 20))}" data-article-size="${key}" aria-label="${label} font size in pixels"></label>`).join("")}
            </div>
        </div>
        <div class="card" style="margin-top:14px">
            <h2>Target language</h2>
            <p class="muted">The language registry provides 7,910 ISO 639 records. Grammar analysis uses language-specific lightweight morphology where available; uncertain forms are left unclassified rather than guessed. Full contextual accuracy requires dedicated NLP models.</p>
            <div class="language-picker-stack">
                <label class="level-control" for="target-language-search">Search language database</label>
                <input id="target-language-search" type="search" autocomplete="off" placeholder="Search English name, native name or ISO code…" aria-label="Search all languages">
                <label class="level-control" for="target-language">Target language</label>
                <select id="target-language" data-language-registry aria-label="Target language">
                    <option value="${escapeHtml(data.languageLearning.settings.targetLanguage || "en")}">${escapeHtml(data.languageLearning.settings.targetLanguage || "en")}</option>
                </select>
                <div class="muted language-database-meta">Complete bundled ISO 639 registry · languages.json · Import/export available in database tools</div>
            </div>
        </div>
        <div class="card" style="margin-top:14px">
          <h2>Learning goals &amp; reminders</h2>
          <label class="level-control">Target CEFR level<select id="target-level">${CEFR_LEVELS.map((level) => `<option ${data.languageLearning.settings.targetLevel === level ? "selected" : ""}>${level}</option>`).join("")}</select></label>
          <label class="level-control">Daily goal in minutes<input id="daily-goal" type="number" min="1" max="600" value="${Number(data.languageLearning.settings.dailyGoalMinutes || 15)}"></label>
          <label><input id="revision-reminders" type="checkbox" ${data.languageLearning.settings.revisionReminders !== false ? "checked" : ""}> Enable revision reminder preference</label>
        </div>`;
    document.getElementById("learning-font-family").value = data.languageLearning.settings.fontFamily || "system-ui";
    view.querySelectorAll("[data-article-font]").forEach((control) => {
        control.value = data.languageLearning.settings.articleTypography?.[control.dataset.articleFont]?.font || "inherit";
    });
    document.getElementById("learning-highlight-style").value = data.languageLearning.settings.highlightStyle || "soft";
    populateLanguageRegistry();
    populateLanguageFonts();
}
/** Show an honest overview of saved study activity and CEFR level selection. */
function renderProgress() {
    heading.textContent = "Language Progress";
    subtitle.textContent = "Track your learning records and choose your next CEFR target.";
    const savedItems = data.languageLearning.items.length;
    const totalVocabulary = data.vocabulary.length;
    const learningArticles = getLearningArticles();
    const completedArticles = learningArticles.filter((article) => article.status === "completed" || Number(article.progress || 0) >= 100).length;
    const masteredGrammar = data.languageLearning.grammar.filter((item) => item.mastered === true).length;
    const articleCount = learningArticles.length;
    const activityDates = new Set(data.languageLearning.settings.activityDates || []);
    let streak = 0;
    for (let offset = 0; offset < 366; offset += 1) {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        const key = date.toISOString().slice(0, 10);
        if (!activityDates.has(key)) break;
        streak += 1;
    }
    const levelIndex = CEFR_LEVELS.indexOf(levelSelect.value);
    view.innerHTML = `
    <div class="card">
      <h2>Your current learning level: ${escapeHtml(levelSelect.value)}</h2>
      <p class="muted">The level selector is a learner-set preference. Article difficulty is estimated separately and should be treated as a guide, not a certified CEFR assessment.</p>
      <div class="progress-track">\
<span style="width:${Math.round(((levelIndex + 1) / CEFR_LEVELS.length) * 100)}%">\
</span>\
</div>
      <div class="article-meta" style="justify-content:space-between;margin-top:8px">\
<span>A1 Beginner</span>\
<span>C2 Proficiency</span>\
</div>
    </div>
    <div class="section-heading">\
<h2>Learning records</h2>\
</div>
    <div class="stat-grid">
      <div class="stat-card">\
<strong>${articleCount}</strong>\
<span>Articles in Reader library</span>\
</div>
      <div class="stat-card">\
<strong>${totalVocabulary}</strong>\
<span>Vocabulary records</span>\
</div>
      <div class="stat-card">\
<strong>${savedItems}</strong>\
<span>Learning items</span>\
</div>
      <div class="stat-card">\
<strong>${data.languageLearning.grammar.length}</strong>\
<span>Grammar notes</span>\
</div>
      <div class="stat-card"><strong>${masteredGrammar}</strong><span>Grammar mastered</span></div>
      <div class="stat-card"><strong>${completedArticles}</strong><span>Articles completed</span></div>
      <div class="stat-card"><strong>${streak}</strong><span>Day learning streak</span></div>
      <div class="stat-card"><strong>${escapeHtml(data.languageLearning.settings.targetLevel || "B2")}</strong><span>Target CEFR level</span></div>
    </div>
    <div class="card" style="margin-top:14px"><h3>Revision reminders</h3><p class="muted">${data.languageLearning.settings.revisionReminders !== false ? "Revision reminders are enabled in your preferences. Scheduled spaced-repetition notifications are not included in this release." : "Revision reminders are disabled."}</p></div>`;
}
/** Open a saved article in the grammar-aware learning reader. */
function openArticle(articleId) {
    selectedToken = "";
    window.getSelection()?.removeAllRanges();
    activeArticle = data.articles.find((article) => article.id === articleId);
    if (!activeArticle) {
        notify("The selected article is no longer in your Reader library.");
        return;
    }
    currentView = "reader";
    const today = new Date().toISOString().slice(0, 10);
    data.languageLearning.settings.activityDates = [...new Set([...(data.languageLearning.settings.activityDates || []), today])].sort();
    if (activeArticle && !activeArticle.firstLearningOpenedAt) activeArticle.firstLearningOpenedAt = new Date().toISOString();
    data.languageLearning.progress.articlesRead = Number(data.languageLearning.progress.articlesRead || 0) + 1;
    data.languageLearning.progress.lastStudyAt = new Date().toISOString();
    persist();
    heading.textContent = "Language Learning Reader";
    subtitle.textContent = "Read the original article and explore contextual learning tools.";
    const text = articleText(activeArticle);
    const level = estimateLevel(text);
    view.innerHTML = `
    <div class="toolbar">
      <button class="button" data-view-link="articles">← Articles</button>
      <span class="pill">My level: ${escapeHtml(levelSelect.value)}</span>
      <span class="pill">Estimated article level: ${level}</span>
      <button class="button" id="toggle-clean-reading">Clean reading</button>
      <button class="button" id="refresh-active-article">↻ Refresh article</button>
      <button class="button" id="toggle-hover-grammar" aria-pressed="${data.settings.hoverGrammarEnabled !== false}">Hover grammar: ${data.settings.hoverGrammarEnabled !== false ? "On" : "Off"}</button>
      <button class="button button-primary" id="mark-article-complete">Mark article complete</button>
    </div>
    <div class="reader-layout">
      <div class="cmj-article-column">
      ${renderArticleDetails(activeArticle, { level })}
      <article class="reader-paper" style="${Object.entries(data.languageLearning.settings.articleTypography || {}).map(([key, value]) => `--article-${key}-font:${escapeHtml(value.font || "inherit")};--article-${key}-size:${Number(value.size || 17)}px`).join(";")}">
        ${renderOriginalArticleHeader(activeArticle)}
        <div class="selection-tools" id="selection-tools" hidden>
          <button class="button" data-save-selection="vocabulary">＋ Save vocabulary</button>
          <button class="button" data-save-selection="sentence">Save sentence</button>
          <button class="button" data-save-selection="grammar">Save grammar note</button>
          <button class="button" data-save-selection="phrase">Save phrase</button>
          <button class="button" data-save-selection="idiom">Save idiom</button>
          <button class="button" data-save-selection="collocation">Save collocation</button>
          <button class="button" data-save-selection="slang">Save slang</button>
          <button class="button" data-save-selection="proverb">Save proverb</button>
          <button class="button" data-save-selection="conversation">Save conversation / passage</button>
        </div>
        <div class="reader-content" id="learning-article-content"
             data-highlight-style="${escapeHtml(data.languageLearning.settings.highlightStyle || "soft")}" 
             style="--learning-font-family:${escapeHtml(data.languageLearning.settings.fontFamily || "system-ui")};--learning-font-size:${Number(data.languageLearning.settings.fontSize || 17)}px;${Object.entries(data.languageLearning.settings.articleTypography || {}).map(([key, value]) => `--article-${key}-font:${escapeHtml(value.font || "inherit")};--article-${key}-size:${Number(value.size || 17)}px`).join(";")}">${renderSafeArticleMarkup(activeArticle)}</div>
      </article>
      </div>
      <aside>
        <section class="side-card grammar-tools-panel">
          <h3>Grammar Tools</h3>
          <p class="muted">Choose which grammar annotations appear in the article.</p>
          <div class="grammar-tools-list">${GRAMMAR_TYPES.map((type) => `<label><input type="checkbox" data-grammar-toggle="${type}" ${enabledGrammar.has(type) ? "checked" : ""}> <span>${GRAMMAR_LABELS[type]}</span></label>`).join("")}</div>
        </section>
        <section class="side-card">
          <h3>Selected word / text</h3>
          <div class="detail-label">Selection</div>
          <div class="detail-value" id="selected-text">Select a word, phrase or sentence in the article.</div>
          <div class="detail-label">Grammar category</div>
          <div class="detail-value" id="selected-category">—</div>
          <button class="button button-primary" id="save-selected-word" disabled>Save to shared vocabulary</button>
        </section>
        <section class="side-card">
          <h3>Article learning summary</h3>
          <div class="detail-label">Estimated level</div>\
<div class="detail-value">${level}</div>
          <div class="detail-label">Word count</div>\
<div class="detail-value">${(text.match(/\b[\p{L}'-]+\b/gu) || []).length.toLocaleString()}</div>
          <div class="detail-label">Reading source</div>\
<div class="detail-value">${escapeHtml(activeArticle.domain || "Saved article")}</div>
        </section>
        <section class="side-card">
          <h3>Learning tip</h3>
          <p class="muted">Select a word or sentence to save it. Grammar colors are heuristic hints and can be switched off individually.</p>
        </section>
      </aside>
    </div>`;
    document.getElementById("learning-article-content").addEventListener("mouseup", updateSelection);
    document.getElementById("learning-article-content").addEventListener("keyup", updateSelection);
    view.querySelectorAll("[data-hide-on-error]").forEach((image) => {
        image.addEventListener("error", () => { image.hidden = true; }, { once: true });
    });
}
/** Read the current text selection and update the selection toolbar. */
function updateSelection() {
    const selection = window.getSelection()?.toString().trim() || "";
    selectedToken = selection;
    const tools = document.getElementById("selection-tools");
    const selectedText = document.getElementById("selected-text");
    const selectedCategory = document.getElementById("selected-category");
    const saveButton = document.getElementById("save-selected-word");
    if (!tools || !selectedText || !selectedCategory || !saveButton)
        return;
    tools.hidden = !selection;
    selectedText.textContent = selection || "Select a word, phrase or sentence in the article.";
    const category = selection.split(/\s+/).length === 1 ? classifyWord(selection) : null;
    selectedCategory.textContent = category ? GRAMMAR_LABELS[category] : "Phrase / sentence";
    saveButton.disabled = !selection;
}
/** Save the current selection into the shared vocabulary collection. */
async function saveVocabularySelection(text) {
    const cleanText = String(text || "").trim();
    if (!cleanText)
        return;
    const duplicate = data.vocabulary.some((item) => String(item.word || "").toLocaleLowerCase() === cleanText.toLocaleLowerCase());
    if (!duplicate) {
        data.vocabulary.unshift({
            id: makeId(),
            word: cleanText,
            originalText: cleanText,
            translation: "",
            definition: "",
            example: activeArticle ? `From: ${activeArticle.title || activeArticle.url}` : "",
            source: activeArticle?.url || "Language Learning",
            sourceUrl: activeArticle?.url || "",
            articleId: activeArticle?.id || null,
            cefrLevel: estimateLevel(cleanText),
            category: "language-learning",
            tags: ["language-learning"],
            notes: "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }
    const today = new Date().toISOString().slice(0, 10);
    data.languageLearning.settings.activityDates = [...new Set([...(data.languageLearning.settings.activityDates || []), today])].sort();
    await persist();
    notify(duplicate ? "This word is already in your shared vocabulary." : "Saved to shared Reader vocabulary.");
}
/** Save a selected sentence, phrase or grammar observation in the learning library. */
async function saveLearningSelection(type, text) {
    const cleanText = String(text || "").trim();
    if (!cleanText) {
        notify("Select some article text first.");
        return;
    }
    const entry = {
        id: makeId(),
        type,
        originalText: cleanText,
        text: cleanText,
        title: cleanText.slice(0, 90),
        definition: "",
        explanation: type === "grammar"
            ? "Add or edit an explanation after saving. The text is stored as a learning note, not an automatic grammar diagnosis."
            : "",
        cefrLevel: estimateLevel(cleanText),
        articleId: activeArticle?.id || null,
        articleTitle: activeArticle?.title || "",
        sourceUrl: activeArticle?.url || "",
        createdAt: new Date().toISOString()
    };
    data.languageLearning.items.unshift(entry);
    const today = new Date().toISOString().slice(0, 10);
    data.languageLearning.settings.activityDates = [...new Set([...(data.languageLearning.settings.activityDates || []), today])].sort();
    if (type === "grammar")
        data.languageLearning.grammar.unshift(entry);
    await persist();
    notify(`${type[0].toUpperCase()}${type.slice(1)} saved to Language Learning.`);
}
/** Re-render the article when grammar filter checkboxes change. */
function updateGrammarFilter(input) {
    const type = input.dataset.grammarToggle;
    if (input.checked)
        enabledGrammar.add(type);
    else
        enabledGrammar.delete(type);

    const content = document.getElementById("learning-article-content");
    if (content && activeArticle)
        content.innerHTML = renderSafeArticleMarkup(activeArticle);
}
/** Capture the active supported website using the existing content-script API. */
async function captureCurrentPage() {
    if (!globalThis.chrome?.tabs?.query || !globalThis.chrome?.tabs?.sendMessage) {
        notify("Open this extension in Chrome or Edge to capture the active page.");
        return;
    }
    try {
        const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
        const activeTab = tabs.find((tab) => tab.active && /^https?:/i.test(tab.url || ""));
        const fallbackTab = tabs
            .filter((tab) => /^https?:/i.test(tab.url || ""))
            .sort((first, second) => (second.lastAccessed || 0) - (first.lastAccessed || 0))[0];
        const tab = activeTab || fallbackTab;
        if (!tab?.id)
            throw new Error("No supported website tab was found in this window.");
        const response = await chrome.tabs.sendMessage(tab.id, { type: "CMJ_GET_PAGE_DATA" });
        if (!response?.ok || !response.article) {
            throw new Error(response?.error || "The current page is not available to the Reader. Check Supported Websites.");
        }
        const article = response.article;
        const existing = data.articles.find((saved) => saved.id === article.id || (saved.url && saved.url === article.url));
        const website = (data.settings.websites || []).find((site) => String(site.domain || "").replace(/^www\./, "") === String(article.domain || "").replace(/^www\./, ""));
        article.languageLearning = true;
        article.language = website?.learningLanguage || data.languageLearning.settings.targetLanguage || "en";
        if (existing) {
            existing.languageLearning = true;
            existing.language = article.language;
            activeArticle = existing;
        }
        else {
            data.articles.unshift(article);
            activeArticle = article;
            await persist();
        }
        notify("Article ready in Language Learning Reader.");
        openArticle(activeArticle.id);
    }
    catch (error) {
        notify(error.message || "Unable to capture this page.");
    }
}
/** Export language-learning records as a portable JSON file. */
function exportLearningData() {
    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        articles: getLearningArticles(),
        vocabulary: data.vocabulary,
        languageLearning: data.languageLearning
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "charlie-mj-language-learning.json";
    link.click();
    URL.revokeObjectURL(url);
    notify("Language-learning data exported.");
}
/** Export the shared learning records as CSV for spreadsheets. */
function exportLearningCsv() {
    const rows = [["recordType", "text", "definition", "language", "cefrLevel", "sourceUrl"],
    ...getLearningArticles().map((article) => ["article", article.title, article.description, article.language, estimateLevel(articleText(article)), article.url]),
    ...data.vocabulary.map((item) => ["vocabulary", item.word || item.originalText, item.definition || item.translation, item.language, item.cefrLevel || item.level, item.sourceUrl || item.url]),
    ...data.languageLearning.items.map((item) => [item.type, item.text || item.originalText, item.definition || item.explanation, item.language, item.cefrLevel, item.sourceUrl]),
    ...data.languageLearning.grammar.map((item) => ["grammar", item.text || item.title, item.explanation, item.language, item.cefrLevel, item.sourceUrl])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    downloadText("charlie-mj-language-learning.csv", csv, "text/csv;charset=utf-8");
    notify("CSV export created.");
}
/** Export saved learning records as a readable Markdown study notebook. */
function exportLearningMarkdown() {
    const lines = ["# Charlie MJ Language Learning", "", `Exported: ${new Date().toLocaleString()}`, "", "## Learning articles", ...getLearningArticles().map((article) => `- [${article.title || "Untitled article"}](${article.url || ""}) — ${article.language || "Language unspecified"}`), "", "## Vocabulary", ...data.vocabulary.map((item) => `- **${item.word || item.originalText || "Word"}** — ${item.definition || item.translation || "No definition"}`), "", "## Learning records", ...data.languageLearning.items.map((item) => `- **${item.type}**: ${item.text || item.originalText || ""}`), "", "## Grammar notes", ...data.languageLearning.grammar.map((item) => `- **${item.title || item.text || "Grammar note"}** — ${item.explanation || ""}`)];
    downloadText("charlie-mj-language-learning.md", lines.join("\n"), "text/markdown;charset=utf-8");
    notify("Markdown study notebook created.");
}
/** Import a Reader backup without replacing unrelated local records. */
async function importLearningBackup(file) {
    const parsed = JSON.parse(await file.text());
    const incoming = parsed.data || parsed;
    if (!incoming || typeof incoming !== "object") throw new Error("The selected file is not a valid Reader backup.");
    if (Array.isArray(incoming.vocabulary)) {
        const known = new Set(data.vocabulary.map((item) => item.id || `${item.word}|${item.createdAt}`));
        data.vocabulary.push(...incoming.vocabulary.filter((item) => !known.has(item.id || `${item.word}|${item.createdAt}`)));
    }
    if (incoming.languageLearning) {
        const current = data.languageLearning;
        const incomingLearning = incoming.languageLearning;
        const mergeById = (first, second) => [...first, ...second.filter((item) => !first.some((existing) => existing.id && existing.id === item.id))];
        data.languageLearning = {
            ...current, ...incomingLearning,
            items: mergeById(current.items || [], incomingLearning.items || []),
            grammar: mergeById(current.grammar || [], incomingLearning.grammar || []),
            settings: { ...(current.settings || {}), ...(incomingLearning.settings || {}) },
            progress: { ...(current.progress || {}), ...(incomingLearning.progress || {}) }
        };
    }
    if (Array.isArray(incoming.articles)) {
        const ids = new Set(data.articles.map((item) => item.id));
        data.articles.push(...incoming.articles.filter((item) => !ids.has(item.id)));
    }
    await persist();
    notify("Learning backup merged successfully.");
    navigate("overview");
}
/** Route to one of the independent Language Learning workspace sections. */
function navigate(nextView) {
    currentView = nextView;
    activeArticle = null;
    document.querySelectorAll("[data-view]").forEach((button) => {
        button.classList.toggle("active", button.dataset.view === nextView);
    });
    const renderers = {
        overview: renderOverview,
        articles: renderArticles,
        vocabulary: renderVocabulary,
        grammar: renderGrammar,
        bookmarks: renderBookmarks,
        progress: renderProgress,
        settings: renderSettings
    };
    (renderers[nextView] || renderOverview)();
}
document.querySelector(".learning-tools-navbar").addEventListener("click", async (event) => {
    const tool = event.target.closest("[data-tool-view]");
    if (tool) navigate(tool.dataset.toolView);
    const actionButton = event.target.closest("[data-tool-action]");
    if (actionButton) {
        const action = actionButton.dataset.toolAction;
        if (!activeArticle) {
            notify("Open a learning article first to use this tool.");
            navigate("articles");
            return;
        }
        if (["idiom", "phrase", "proverb", "slang", "suffix", "note", "grammar", "sentence", "vocabulary"].includes(action)) {
            if (!selectedToken) {
                notify("Select a word, phrase or sentence in the article first.");
                return;
            }
            if (action === "vocabulary") await saveVocabularySelection(selectedToken);
            else await saveLearningSelection(action === "note" ? "note" : action, selectedToken);
        }
        else if (action === "translate") {
            if (!selectedToken) {
                notify("Select text to translate first.");
                return;
            }
            try {
                const result = await chrome.runtime.sendMessage({ type: "CMJ_TRANSLATE_TEXT", text: selectedToken });
                if (!result?.ok) throw new Error(result?.error || "Translation was unavailable.");
                notify(`Translation: ${result.translation}`);
            } catch (error) {
                notify(error.message || "Translation failed.");
            }
        }
        else if (action === "listen" || action === "pronunciation") {
            if (!selectedToken) {
                notify("Select a word or sentence to hear it.");
                return;
            }
            if (!("speechSynthesis" in window)) {
                notify("Speech synthesis is not available in this browser.");
                return;
            }
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(selectedToken);
            utterance.lang = data.languageLearning.settings.targetLanguage || "en";
            window.speechSynthesis.speak(utterance);
        }
        else if (action === "level-check") {
            const targetText = selectedToken || articleText(activeArticle);
            notify(`Estimated level: ${estimateLevel(targetText)}. This is a heuristic, not a formal CEFR test.`);
        }
        else if (action === "analyze") {
            const targetText = selectedToken || articleText(activeArticle);
            const count = (targetText.match(/\b[\p{L}'-]+\b/gu) || []).length;
            notify(`Analysis: ${count.toLocaleString()} words · estimated ${estimateLevel(targetText)}.`);
        }
        else if (action === "bookmark") {
            data.bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];
            data.bookmarks.unshift({
                id: makeId(),
                articleId: activeArticle.id,
                url: activeArticle.url,
                title: activeArticle.title,
                text: selectedToken || "Reading position saved from Language Learning.",
                createdAt: new Date().toISOString(),
                source: "language-learning"
            });
            await persist();
            notify("Learning bookmark saved to the shared Reader bookmarks.");
        }
    }
    if (event.target.closest("#export-bookmarks")) {
        const blob = new Blob([JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), bookmarks: data.bookmarks || [] }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "charlie-mj-bookmarks.json"; link.click(); URL.revokeObjectURL(url);
        return;
    }
    if (event.target.closest("#learning-export-json")) exportLearningData();
    if (event.target.closest("#learning-export-csv")) exportLearningCsv();
    if (event.target.closest("#learning-export-md")) exportLearningMarkdown();
    if (event.target.closest("#learning-import-button")) document.getElementById("learning-import-file").click();
});
document.getElementById("close-learning-details")?.addEventListener("click", () => {
    document.getElementById("learning-article-details")?.close();
});
document.getElementById("learning-import-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await importLearningBackup(file); }
    catch (error) { notify(error.message || "Unable to import this backup."); }
    event.target.value = "";
});
document.getElementById("learning-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (button)
        navigate(button.dataset.view);
});
document.addEventListener("click", async (event) => {
    const viewLink = event.target.closest("[data-view-link]");
    if (viewLink) {
        navigate(viewLink.dataset.viewLink);
        return;
    }
    const learningDetailsButton = event.target.closest("[data-learning-details]");
    if (learningDetailsButton) {
        const article = data.articles.find((item) => item.id === learningDetailsButton.dataset.learningDetails);
        if (article) {
            const dialog = document.getElementById("learning-article-details");
            const sourceUrl = (() => {
                try { const url = new URL(article.url); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; }
                catch { return ""; }
            })();
            const details = [
                ["Subtitle", article.subtitle], ["Description", article.description],
                ["Author", article.author], ["Published", article.publishedAt || article.date],
                ["Website", article.siteName || article.domain], ["Domain", article.domain],
                ["Language", article.languageName || article.language], ["Category", article.category],
                ["Word count", article.wordCount || (article.text || "").split(/\s+/).filter(Boolean).length],
                ["Reading time", article.readingMinutes ? `${article.readingMinutes} min` : ""],
                ["Saved", article.savedAt], ["Last fetched", article.fetchedAt],
                ["Canonical URL", article.canonical], ["Tags", (article.tags || []).join(", ")],
                ["Article status", article.status], ["Reading progress", `${Math.round(article.progress || 0)}%`]
            ].filter(([, value]) => value !== undefined && value !== null && value !== "");
            document.getElementById("learning-details-title").textContent = article.title || "Article details";
            document.getElementById("learning-details-content").innerHTML = `
                ${article.thumbnail || article.image ? `<img class="learning-details-thumbnail" src="${escapeHtml(article.thumbnail || article.image)}" alt="Article thumbnail">` : ""}
                <div class="learning-details-grid">${details.map(([label, value]) => `<div class="learning-detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>
                ${sourceUrl ? `<a class="button button-primary" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open original website ↗</a>` : ""}`;
            dialog?.showModal();
        }
        return;
    }
    const refreshLearningButton = event.target.closest("[data-refresh-learning-article]");
    if (refreshLearningButton) {
        const article = data.articles.find((item) => item.id === refreshLearningButton.dataset.refreshLearningArticle);
        if (article?.url) {
            notify("Refreshing article from its original website…");
            try {
                await saveArticleFromUrl(article.url, article.category || "General");
                data = await getAll();
                notify("Article refreshed using the shared Reader fetch engine.");
                renderArticles();
            } catch (error) { notify(error.message || "Article refresh failed."); }
        }
        return;
    }
    const openButton = event.target.closest("[data-open-article]");
    if (openButton) {
        openArticle(openButton.dataset.openArticle);
        return;
    }
    const selectionButton = event.target.closest("[data-save-selection]");
    if (selectionButton) {
        await saveLearningSelection(selectionButton.dataset.saveSelection, selectedToken);
        return;
    }
    if (event.target.closest("#save-selected-word")) {
        await saveVocabularySelection(selectedToken);
        return;
    }
    const reviewButton = event.target.closest("[data-review-vocabulary]");
    if (reviewButton) {
        const record = data.vocabulary.find((item) => String(item.id || item.word || "") === reviewButton.dataset.reviewVocabulary);
        if (record) {
            record.lastReviewedAt = new Date().toISOString();
            record.reviewCount = Number(record.reviewCount || 0) + 1;
            await persist();
            notify("Vocabulary review saved.");
            renderVocabulary();
        }
        return;
    }
    const grammarButton = event.target.closest("[data-master-grammar]");
    if (grammarButton) {
        const record = data.languageLearning.grammar.find((item) => item.id === grammarButton.dataset.masterGrammar);
        if (record) {
            record.mastered = !record.mastered;
            record.masteredAt = record.mastered ? new Date().toISOString() : null;
            await persist();
            renderGrammar();
            notify(record.mastered ? "Grammar topic marked mastered." : "Grammar topic moved back to in progress.");
        }
        return;
    }
    if (event.target.closest("#refresh-active-article")) {
        if (!activeArticle?.url) {
            notify("The original article URL is unavailable.");
            return;
        }
        const articleId = activeArticle.id;
        try {
            notify("Refreshing article and metadata from the original website…");
            await saveArticleFromUrl(activeArticle.url, activeArticle.category || "General");
            data = await getAll();
            const refreshed = data.articles.find((item) => item.id === articleId);
            if (refreshed) openArticle(refreshed.id);
            notify("Article content and available metadata refreshed.");
        } catch (error) {
            notify(error.message || "Article refresh failed. The source may block automated fetching.");
        }
        return;
    }
    if (event.target.closest("#mark-article-complete")) {
        if (activeArticle) {
            activeArticle.status = "completed";
            activeArticle.progress = 100;
            activeArticle.completedAt = new Date().toISOString();
            await persist();
            notify("Article marked as completed.");
        }
        return;
    }
    if (event.target.closest("#translate-selection")) {
        const output = document.getElementById("selection-translation");
        if (!selectedToken || !output)
            return;
        output.textContent = "Translating…";
        try {
            const result = await chrome.runtime.sendMessage({
                type: "CMJ_TRANSLATE_TEXT",
                text: selectedToken
            });
            if (!result?.ok)
                throw new Error(result?.error || "Translation was unavailable.");
            output.textContent = result.translation;
        }
        catch (error) {
            output.textContent = error.message || "Translation failed.";
        }
        return;
    }
    if (event.target.closest("#speak-selection")) {
        if (!selectedToken || !("speechSynthesis" in window)) {
            notify("Speech synthesis is not available in this browser.");
            return;
        }
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(selectedToken));
        return;
    }
    if (event.target.closest("#capture-from-articles") || event.target.closest("#capture-current")) {
        await captureCurrentPage();
        return;
    }
    if (event.target.closest("#export-learning")) {
        exportLearningData();
        return;
    }
    if (event.target.closest("#grammar-export")) {
        const payload = {
            version: 1,
            exportedAt: new Date().toISOString(),
            grammar: data.languageLearning.grammar
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "charlie-mj-grammar-notes.json";
        link.click();
        URL.revokeObjectURL(url);
        notify("Grammar notes exported.");
    }
    if (event.target.closest("#toggle-clean-reading")) {

    const content = document.getElementById("learning-article-content");
        content?.classList.toggle("clean-reading");
        if (content)
            content.querySelectorAll(".learning-token").forEach((token) => {
                token.style.color = "";
                token.style.fontWeight = "";
                token.style.fontStyle = "";
                token.style.textDecoration = "";
            });
    }
});
document.addEventListener("change", async (event) => {
    const input = event.target;
    if (input.id === "target-language" || input.id === "learning-target-language") {
        data.languageLearning.settings.targetLanguage = input.value;
        await persist();
        populateLanguageFonts();
        return;
    }
    if (input.matches("[data-grammar-toggle]")) {
        updateGrammarFilter(input);
        return;
    }
    if (input.matches("[data-grammar-background]")) {
        const type = input.dataset.grammarBackground;
        data.languageLearning.settings.grammarBackgrounds = { ...(data.languageLearning.settings.grammarBackgrounds || {}), [type]: input.value };
        await persist();
        if (activeArticle) openArticle(activeArticle.id);
        return;
    }
    if (input.matches("[data-grammar-font]")) {
        const type = input.dataset.grammarFont;
        data.languageLearning.settings.grammarFonts = { ...(data.languageLearning.settings.grammarFonts || {}), [type]: input.value };
        await persist();
        if (activeArticle) openArticle(activeArticle.id);
        return;
    }
    if (input.matches("[data-grammar-style]")) {
        const type = input.dataset.grammarStyle;
        data.languageLearning.settings.grammarStyles = { ...(data.languageLearning.settings.grammarStyles || {}), [type]: input.value };
        await persist();
        if (activeArticle) openArticle(activeArticle.id);
        return;
    }
    if (input.matches("[data-grammar-color]")) {
        const type = input.dataset.grammarColor;
        data.languageLearning.settings.grammarColors = {
            ...(data.languageLearning.settings.grammarColors || {}),
            [type]: input.value
        };
        await persist();
        if (activeArticle) {

    const content = document.getElementById("learning-article-content");
            if (content)
                content.innerHTML = renderSafeArticleMarkup(activeArticle);
        }
        notify(`${GRAMMAR_LABELS[type]} highlight color saved.`);
        return;
    }
    if (input.id === "target-level") {
        data.languageLearning.settings.targetLevel = input.value;
        await persist();
        return;
    }
    if (input.id === "daily-goal") {
        data.languageLearning.settings.dailyGoalMinutes = Math.max(1, Math.min(600, Number(input.value) || 15));
        await persist();
        return;
    }
    if (input.id === "revision-reminders") {
        data.languageLearning.settings.revisionReminders = input.checked;
        await persist();
        return;
    }
    if (input.matches("[data-article-font], [data-article-size]")) {
        const key = input.dataset.articleFont || input.dataset.articleSize;
        const typography = { ...(data.languageLearning.settings.articleTypography || {}) };
        typography[key] = { ...(typography[key] || {}), ...(input.dataset.articleFont ? { font: input.value } : { size: Math.max(10, Math.min(64, Number(input.value) || 17)) }) };
        data.languageLearning.settings.articleTypography = typography;
        await persist();

    const content = document.getElementById("learning-article-content");
        if (content) {
            const cssKey = key === "body" ? "body" : key;
            const property = input.dataset.articleFont ? `--article-${cssKey}-font` : `--article-${cssKey}-size`;
            content.style.setProperty(property, input.dataset.articleFont ? input.value : `${typography[key].size}px`);
            const paper = content.closest(".reader-paper");
            if (paper) paper.style.setProperty(property, input.dataset.articleFont ? input.value : `${typography[key].size}px`);
        }
        return;
    }
    if (input.id === "learning-font-family") {
        data.languageLearning.settings.fontFamily = input.value;
        await persist();
        document.getElementById("learning-article-content")?.style.setProperty("--learning-font-family", input.value);
        return;
    }
    if (input.id === "learning-font-size") {
        data.languageLearning.settings.fontSize = Math.max(12, Math.min(32, Number(input.value) || 17));
        await persist();
        document.getElementById("learning-article-content")?.style.setProperty("--learning-font-size", `${data.languageLearning.settings.fontSize}px`);
        return;
    }
    if (input.id === "learning-highlight-style") {
        data.languageLearning.settings.highlightStyle = input.value;
        await persist();
        document.getElementById("learning-article-content")?.setAttribute("data-highlight-style", input.value);
        return;
    }
    if (input.id === "target-language" || input.id === "learning-target-language") {
        data.languageLearning.settings.targetLanguage = input.value;
        await persist();
        notify("Target language preference saved.");
        return;
    }
    if (input === levelSelect) {
        data.languageLearning.settings.learnerLevel = input.value;
        await persist();
        if (currentView === "progress")
            renderProgress();
        notify("Your CEFR learner level was saved.");
    }
});
document.addEventListener("input", (event) => {
    if (event.target.id === "article-search") {
        const query = event.target.value.toLocaleLowerCase();
        const filtered = getLearningArticles().filter((article) => `${article.title || ""} ${article.domain || ""} ${article.url || ""}`
            .toLocaleLowerCase().includes(query));
        const target = document.getElementById("learning-articles");
        if (target)
            target.innerHTML = filtered.length
                ? filtered.map(articleCard).join("")
                : `<div class="empty-state">No matching articles.</div>`;
    }
    if (event.target.id === "item-search") {
        const query = event.target.value.toLocaleLowerCase();
        const filtered = data.vocabulary.filter((item) => `${item.word || ""} ${item.definition || ""} ${item.translation || ""}`
            .toLocaleLowerCase().includes(query));
        const target = document.getElementById("learning-items");
        if (target)
            target.innerHTML = filtered.map((item) => `
      <article class="list-item">\
<strong>${escapeHtml(item.word || "Vocabulary item")}</strong>
      <p>${escapeHtml(item.definition || item.translation || "")}</p>\
</article>`).join("")
                || `<div class="empty-state">No matching vocabulary.</div>`;
    }
});
levelSelect.addEventListener("change", async () => {
    data.languageLearning.settings.learnerLevel = levelSelect.value;
    await persist();
});
document.getElementById("capture-current").addEventListener("click", captureCurrentPage);
// Load the complete ISO 639 selector on the main learning workspace as well as Settings.
populateLanguageRegistry();
navigate("overview");
const requestedArticleId = new URLSearchParams(location.search).get("article");
if (requestedArticleId) {
    const requestedArticle = data.articles.find((article) => article.id === requestedArticleId);
    if (requestedArticle) {
        requestedArticle.languageLearning = true;
        await persist();
        openArticle(requestedArticleId);
    } else {
        notify("The requested article could not be found in the shared Reader library.");
    }
}

/* ---------- Hover grammar detection (multilingual engine) ---------- */

/** Show the language, category, meaning and grammar details of the word under the cursor. */
installHoverGrammar({
    isEnabled: () => data.settings.hoverGrammarEnabled !== false,
    getLanguageHint: () => activeArticle?.language || activeArticle?.lang || data.languageLearning.settings.targetLanguage || "en",
    getMeaningLanguage: () => data.settings.translationTarget || "en",
    getExtraLanguages: () => [data.languageLearning?.settings?.targetLanguage, data.settings.translationSource].filter(Boolean),
    scope: ".reader-content"
});

/** Toggle hover grammar from the article toolbar and remember the choice. */
document.addEventListener("click", async (event) => {
    const button = event.target.closest("#toggle-hover-grammar");
    if (!button) return;
    data.settings.hoverGrammarEnabled = data.settings.hoverGrammarEnabled === false;
    await saveAll(data);
    button.textContent = `Hover grammar: ${data.settings.hoverGrammarEnabled ? "On" : "Off"}`;
    button.setAttribute("aria-pressed", String(data.settings.hoverGrammarEnabled));
});
