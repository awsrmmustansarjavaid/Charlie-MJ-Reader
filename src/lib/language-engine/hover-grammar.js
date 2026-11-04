/**
 * @file Hover grammar detection for reader pages.
 *
 * Detects the word under the mouse cursor, sends it to the language engine,
 * and shows a tooltip with the language, grammatical category, meaning and
 * grammatical details. All tooltip text is inserted with `textContent`, so
 * content from web pages or dictionaries can never inject markup.
 */
import { createDefaultEngine } from "./engine.js";

/** Pause (ms) the pointer must stay on a word before analysis starts. */
const DEFAULT_DWELL_MS = 350;

/** Gap in pixels between the pointer and the tooltip. */
const TOOLTIP_OFFSET = 14;

/** Characters that belong to a word. */
const WORD_CHAR = /[\p{L}\p{M}\p{N}'’-]/u;

/**
 * Find the word at a screen position and its sentence.
 * @param {number} x Viewport X.
 * @param {number} y Viewport Y.
 * @returns {{word: string, sentence: string, isSentenceStart: boolean, rect: DOMRect}|null} Word under the pointer.
 */
export function wordAtPoint(x, y) {
    let node;
    let offset;
    if (document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(x, y);
        node = position?.offsetNode;
        offset = position?.offset;
    } else if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        node = range?.startContainer;
        offset = range?.startOffset;
    }
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;

    const text = node.textContent;
    let start = Math.min(offset, text.length);
    let end = start;
    while (start > 0 && WORD_CHAR.test(text[start - 1])) start -= 1;
    while (end < text.length && WORD_CHAR.test(text[end])) end += 1;
    const word = text.slice(start, end).replace(/^['’-]+|['’-]+$/g, "");
    if (!word) return null;

    // The pointer must really be over the word, not in blank space beside it.
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const rect = range.getBoundingClientRect();
    if (x < rect.left - 2 || x > rect.right + 2 || y < rect.top - 2 || y > rect.bottom + 2) return null;

    // Sentence context: text of the parent block around the word.
    const block = node.parentElement?.closest("p, li, blockquote, h1, h2, h3, h4, td, div") || node.parentElement;
    const blockText = (block?.textContent || text).replace(/\s+/g, " ");
    const index = Math.max(0, blockText.indexOf(word));
    const before = blockText.slice(0, index);
    const sentenceStart = Math.max(before.lastIndexOf(". "), before.lastIndexOf("? "), before.lastIndexOf("! "), -1) + 1;
    const after = blockText.slice(index).search(/[.!?](\s|$)/);
    const sentence = blockText.slice(sentenceStart, after === -1 ? undefined : index + after + 1).trim();
    return { word, sentence, isSentenceStart: before.slice(sentenceStart).trim().length === 0, rect };
}

/** Append a labelled row to a container. */
function appendRow(container, label, value) {
    const row = document.createElement("div");
    row.className = "cmj-hg-row";
    const key = document.createElement("span");
    key.textContent = label;
    const content = document.createElement("strong");
    content.textContent = value;
    row.append(key, content);
    container.append(row);
}

/**
 * Install hover grammar detection.
 * @param {object} options Installation options.
 * @param {() => boolean} options.isEnabled Whether the feature is currently on.
 * @param {() => string} options.getLanguageHint Expected language of the page (article language or learner target).
 * @param {() => string} [options.getMeaningLanguage] Language for meanings (default English).
 * @param {() => string[]} [options.getExtraLanguages] Other languages the reader studies (tried after the word's own evidence).
 * @param {string} [options.scope] CSS selector limiting where hovering works.
 * @param {number} [options.dwellMs] Hover delay before analysis.
 * @returns {{destroy: () => void}} Handle to remove listeners.
 */
export function installHoverGrammar({ isEnabled, getLanguageHint, getMeaningLanguage = () => "en", getExtraLanguages = () => [], scope = ".reader-content, .reading-content", dwellMs = DEFAULT_DWELL_MS }) {
    /** @type {Promise<import("./engine.js").LanguageEngine>|null} */
    let enginePromise = null;
    let timer = 0;
    let lastKey = "";
    let requestId = 0;

    const tip = document.createElement("div");
    tip.className = "cmj-hg-tip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    document.body.append(tip);

    const hide = () => { clearTimeout(timer); tip.hidden = true; lastKey = ""; requestId += 1; };

    /** Position the tooltip near the word, keeping it inside the viewport. */
    const place = (rect) => {
        tip.style.left = "0px";
        tip.style.top = "0px";
        const box = tip.getBoundingClientRect();
        const left = Math.min(Math.max(8, rect.left), window.innerWidth - box.width - 8);
        const below = rect.bottom + TOOLTIP_OFFSET;
        const top = below + box.height > window.innerHeight - 8 ? Math.max(8, rect.top - box.height - TOOLTIP_OFFSET) : below;
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
    };

    /** Render a loading, error or result state into the tooltip. */
    const render = (target, state) => {
        tip.replaceChildren();
        const head = document.createElement("div");
        head.className = "cmj-hg-head";
        const word = document.createElement("strong");
        word.className = "cmj-hg-word";
        word.textContent = target.word;
        head.append(word);

        if (state.loading) {
            const status = document.createElement("span");
            status.className = "cmj-hg-muted";
            status.textContent = "Analyzing…";
            head.append(status);
            tip.append(head);
        } else {
            const result = state.result;
            const badge = document.createElement("span");
            badge.className = `cmj-hg-badge cmj-hg-${result.category}`;
            badge.textContent = result.categoryLabel;
            head.append(badge);
            tip.append(head);

            const body = document.createElement("div");
            body.className = "cmj-hg-body";
            const confidence = result.confidence ? ` · ${Math.round(result.confidence * 100)}% confidence` : "";
            const basis = { letters: "detected from letters", script: "detected from script", sentence: "detected from the sentence", hint: "from the article language", default: "not detected" }[result.language.method] || result.language.method;
            appendRow(body, "Language", `${result.language.name}${result.language.code === "und" ? "" : ` (${result.language.code})`} · ${basis}${result.language.confirmed ? ", confirmed by its grammar rules" : ""}`);
            appendRow(body, "Category", `${result.categoryLabel}${confidence}`);
            if (result.meaning) appendRow(body, "Meaning", result.meaning);
            if (result.lemma) appendRow(body, "Dictionary form", result.lemma);
            for (const [label, value] of result.details) appendRow(body, label, value);
            tip.append(body);

            const foot = document.createElement("div");
            foot.className = "cmj-hg-foot";
            const coverage = { full: "Rule-based + dictionary", partial: "Partial analysis", minimal: "Minimal analysis" }[result.coverage];
            foot.textContent = [coverage, result.sources.length ? `Sources: ${result.sources.join(", ")}` : ""].filter(Boolean).join(" · ");
            tip.append(foot);
            if (result.note) {
                const note = document.createElement("div");
                note.className = "cmj-hg-note";
                note.textContent = result.note;
                tip.append(note);
            }
        }
        tip.hidden = false;
        place(target.rect);
    };

    /** Run the analysis for a detected word. */
    const analyse = async (target) => {
        const current = ++requestId;
        render(target, { loading: true });
        try {
            enginePromise ||= createDefaultEngine();
            const engine = await enginePromise;
            const result = await engine.analyze(target.word, {
                sentence: target.sentence,
                isSentenceStart: target.isSentenceStart,
                languageHint: getLanguageHint(),
                extraLanguages: getExtraLanguages(),
                meaningLanguage: getMeaningLanguage()
            });
            if (current === requestId) render(target, { result });
        } catch (error) {
            console.warn("Charlie MJ Reader: grammar analysis failed.", error);
            if (current === requestId) hide();
        }
    };

    const onMove = (event) => {
        if (!isEnabled() || tip.contains(event.target)) return;
        if (!(event.target instanceof Element) || !event.target.closest(scope) || event.target.closest("button, input, textarea, select, a[href]")) {
            hide();
            return;
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
            const target = wordAtPoint(event.clientX, event.clientY);
            if (!target) { hide(); return; }
            const key = `${target.word}|${Math.round(target.rect.left)}|${Math.round(target.rect.top)}`;
            if (key === lastKey) return;
            lastKey = key;
            analyse(target);
        }, dwellMs);
    };
    const onKey = (event) => { if (event.key === "Escape") hide(); };

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mousedown", hide, true);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", onKey);

    return {
        destroy() {
            hide();
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mousedown", hide, true);
            document.removeEventListener("scroll", hide, true);
            document.removeEventListener("keydown", onKey);
            tip.remove();
        }
    };
}
