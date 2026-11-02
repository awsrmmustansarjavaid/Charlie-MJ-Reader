/**
 * @file Shared two-section article presentation for Charlie MJ Reader.
 *
 * Used by both the Productivity Reader and the Language Learning Reader so
 * the two modes always render articles identically:
 *
 *   Section 1 - "Article Details": metadata taken from the source website
 *               (thumbnail, title, subtitle, description, author, dates)
 *               plus a grid of reading statistics.
 *   Section 2 - "Original Article": the complete article with its own
 *               header (title, subtitle, author, date, hero image) followed
 *               by the cleaned body content.
 *
 * This module is dependency-free and safe to import from any extension page.
 */

/** Average adult reading speed used when the saved article has no estimate. */
const WORDS_PER_MINUTE = 220;

/** Description length (characters) above which a "Show more" toggle is offered. */
const DESCRIPTION_TOGGLE_THRESHOLD = 220;

/** Leaf-block text at or beyond this length is treated as real article content. */
const CONTENT_TEXT_THRESHOLD = 160;

/** Maximum number of leading leaf blocks inspected for publisher chrome. */
const MAX_LEADING_BLOCKS = 12;

/** Standalone UI labels that publishers inject above the article body. */
const CHROME_LABEL_PATTERN =
    /^(search|read|follow|following|subscribe|share|listen|save|sign in|get started|member-only story|menu)$/i;

/** Relative publication times ("3 days ago", "yesterday") and read-time labels ("6 min read"). */
const CHROME_META_PATTERN =
    /\d+\s*(?:min|minute)s?\s+read\b|\b\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago(?![a-z])|^(?:just now|yesterday|today)$/i;

/** A byline sits near the top: only the first N non-empty text nodes are inspected. */
const BYLINE_MAX_TEXT_NODES = 40;

/** A byline container (avatar + author + date + read time) is always short. */
const BYLINE_MAX_TEXT = 140;

/** Avatars are small; anything larger than this (px) is treated as article media. */
const AVATAR_MAX_DIMENSION = 96;

/** HTML escape table for untrusted metadata inserted into extension markup. */
const HTML_ESCAPES = Object.freeze({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
});

/**
 * Escape untrusted text before inserting it into extension-owned markup.
 * @param {unknown} value Any value; it is coerced to a string.
 * @returns {string} The escaped string.
 */
export function escapeMarkup(value = "") {
    return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/**
 * Return an absolute HTTP(S) URL, or an empty string for unsafe or invalid input.
 * Rejects `javascript:`, `data:` and every other non-web scheme.
 * @param {string} value Candidate URL (absolute or relative).
 * @param {string} [baseUrl] Base used to resolve relative URLs.
 * @returns {string} A safe absolute URL or "".
 */
export function safeHttpUrl(value, baseUrl = "") {
    try {
        const parsed = new URL(value, baseUrl || globalThis.location?.href);
        return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch {
        return "";
    }
}

/**
 * Collapse whitespace and lower-case text so equal strings compare reliably.
 * @param {unknown} value Text to normalise.
 * @returns {string} Normalised text.
 */
function normalizeText(value) {
    return String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

/**
 * Extract plain text from a saved article without touching the stored record.
 * @param {object} article Saved article record.
 * @returns {string} Plain article text.
 */
function getArticleText(article) {
    if (article?.text) return String(article.text);
    const parsed = new DOMParser().parseFromString(article?.html || "", "text/html");
    return parsed.body.textContent || "";
}

/**
 * Format an ISO date as "30 Oct 2026, 09:38"; unparsable input is returned as-is.
 * @param {string} value Raw publication date from the source website.
 * @returns {string} Human readable date and time, or "".
 */
function formatPublishedDate(value) {
    if (!value) return "";
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp)
        ? String(value)
        : new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Compute the reading statistics displayed in the "Article Details" grid.
 * @param {object} article Saved article record.
 * @returns {{words: number, sentences: number, paragraphs: number, readingMinutes: number}}
 */
export function computeArticleStats(article) {
    const text = getArticleText(article);
    const words = (text.match(/[\p{L}\p{N}'’-]+/gu) || []).length;
    const sentences = (text.match(/[^.!?\u06D4\u3002]+[.!?\u06D4\u3002]+/g) || []).length || (words ? 1 : 0);

    // Count paragraphs from markup when available; otherwise from blank lines.
    let paragraphs = 0;
    if (article?.html) {
        const parsed = new DOMParser().parseFromString(article.html, "text/html");
        paragraphs = parsed.body.querySelectorAll("p").length;
    }
    if (!paragraphs) paragraphs = text.split(/\n{2,}/).filter((part) => part.trim()).length;

    const savedMinutes = Number(article?.readingMinutes);
    const readingMinutes = Number.isFinite(savedMinutes) && savedMinutes > 0
        ? Math.round(savedMinutes)
        : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));

    return { words, sentences, paragraphs, readingMinutes };
}

/**
 * Normalise every field both sections need from a saved article record.
 * Centralising this keeps the two sections consistent and tolerant of the
 * different field names produced by individual site adapters.
 * @param {object} article Saved article record.
 * @returns {object} Display-ready, validated article metadata.
 */
function resolveArticleMeta(article = {}) {
    let sourceHost = "";
    try { sourceHost = article.url ? new URL(article.url).hostname : ""; } catch { /* Invalid URL: fall back to site label. */ }

    const sourceUrl = safeHttpUrl(article.url || "");
    return {
        title: article.title || "Untitled article",
        subtitle: article.subtitle || "",
        description: article.description || "",
        author: article.author || "",
        authorHandle: article.authorHandle || article.authorUsername || "",
        authorPhoto: safeHttpUrl(article.authorImage || article.authorPhoto || detectAuthorPhoto(article) || "", sourceUrl),
        image: safeHttpUrl(article.image || article.thumbnail || "", sourceUrl),
        publishedLabel: formatPublishedDate(article.publishedAt || article.datePublished || article.date || ""),
        category: article.category || "",
        language: article.language || article.lang || "",
        sourceName: article.siteName || article.domain || sourceHost || "Original source",
        sourceHost,
        sourceUrl
    };
}

/**
 * Render the author avatar, falling back to an initial when no photo exists.
 * @param {object} meta Output of {@link resolveArticleMeta}.
 * @param {string} prefix CSS class prefix.
 * @returns {string} Avatar markup.
 */
function renderAvatar(meta, prefix) {
    if (meta.authorPhoto) {
        return `<img class="${prefix}-avatar cmj-author-photo" src="${escapeMarkup(meta.authorPhoto)}" alt="${escapeMarkup(meta.author || "Author")}" loading="lazy" referrerpolicy="no-referrer">`;
    }
    const initial = escapeMarkup((meta.author || "A").slice(0, 1).toUpperCase());
    return `<span class="${prefix}-avatar ${prefix}-avatar-fallback" role="img" aria-label="Author photo unavailable">${initial}</span>`;
}

/**
 * Render one statistic tile for the details grid.
 * @param {string} label Short uppercase label.
 * @param {string} value Primary value.
 * @param {string} [note] Optional secondary line.
 * @returns {string} Tile markup.
 */
function renderStatTile(label, value, note = "") {
    return `<div class="cmj-ad-tile">
            <span class="cmj-ad-tile-label">${escapeMarkup(label)}</span>
            <strong class="cmj-ad-tile-value">${value}</strong>
            ${note ? `<span class="cmj-ad-tile-note">${escapeMarkup(note)}</span>` : ""}
        </div>`;
}

/**
 * Render Section 1, "Article Details": website metadata plus a statistics grid.
 * @param {object} article Saved article record.
 * @param {{level?: string}} [options] `level` adds an estimated CEFR tile
 *     (supplied by Language Learning mode, which owns the level estimator).
 * @returns {string} Section markup.
 */
export function renderArticleDetails(article = {}, options = {}) {
    const meta = resolveArticleMeta(article);
    const stats = computeArticleStats(article);
    const hasToggle = meta.description.length > DESCRIPTION_TOGGLE_THRESHOLD;
    const authorLine = [meta.authorHandle ? `@${meta.authorHandle.replace(/^@/, "")}` : "", meta.sourceName]
        .filter(Boolean).join(" · ");

    const thumbnail = meta.image
        ? `<img class="cmj-ad-thumb-image" src="${escapeMarkup(meta.image)}" alt="Article thumbnail" loading="lazy" referrerpolicy="no-referrer">`
        : `<div class="cmj-ad-thumb-empty" role="img" aria-label="No thumbnail available">No thumbnail</div>`;

    const sourceLink = meta.sourceUrl
        ? `<a class="cmj-ad-link" href="${escapeMarkup(meta.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeMarkup(meta.sourceHost || meta.sourceName)} ↗</a>`
        : escapeMarkup(meta.sourceName);

    const tiles = [
        renderStatTile("Reading time", `${stats.readingMinutes} min`),
        renderStatTile("Total words", stats.words.toLocaleString()),
        renderStatTile("Sentences", stats.sentences.toLocaleString(), `${stats.paragraphs.toLocaleString()} paragraphs`),
        options.level ? renderStatTile("Estimated level", escapeMarkup(options.level)) : "",
        renderStatTile("Published", escapeMarkup(meta.publishedLabel || "Not provided")),
        renderStatTile("Category · Source", `${escapeMarkup(meta.category || meta.language || "General")} · ${sourceLink}`)
    ].filter(Boolean).join("");

    return `<section class="cmj-ad" id="cmj-article-details" aria-labelledby="cmj-ad-heading">
        <header class="cmj-section-label">
            <span class="cmj-section-badge">SECTION 1</span>
            <h2 id="cmj-ad-heading">Article Details</h2>
            <span class="cmj-section-hint">From ${escapeMarkup(meta.sourceHost || meta.sourceName)}</span>
        </header>
        <div class="cmj-ad-top">
            <figure class="cmj-ad-thumb">${thumbnail}</figure>
            <div class="cmj-ad-copy">
                <h3 class="cmj-ad-title">${escapeMarkup(meta.title)}</h3>
                ${meta.subtitle ? `<p class="cmj-ad-subtitle">${escapeMarkup(meta.subtitle)}</p>` : ""}
                ${meta.description ? `<p class="cmj-ad-description" data-clamped="${hasToggle}">${escapeMarkup(meta.description)}</p>` : ""}
                ${hasToggle ? `<button type="button" class="cmj-ad-toggle" data-cmj-toggle-description aria-expanded="false">Show more</button>` : ""}
                <div class="cmj-ad-author">
                    ${renderAvatar(meta, "cmj-ad")}
                    <div class="cmj-ad-author-copy">
                        <strong>${escapeMarkup(meta.author || "Author not provided")}</strong>
                        <span>${escapeMarkup(authorLine)}</span>
                    </div>
                </div>
            </div>
        </div>
        <div class="cmj-ad-grid" role="list" aria-label="Article statistics">${tiles}</div>
    </section>`;
}

/**
 * Render the header of Section 2, "Original Article": section label, title,
 * subtitle, author row and hero image. Place it at the top of the article card,
 * immediately before the cleaned body content.
 * @param {object} article Saved article record.
 * @returns {string} Header markup.
 */
export function renderOriginalArticleHeader(article = {}) {
    const meta = resolveArticleMeta(article);
    const stats = computeArticleStats(article);
    const byline = [meta.publishedLabel, `${stats.readingMinutes} min read`].filter(Boolean).join(" · ");

    return `<header class="cmj-oa-header" aria-label="Original article">
        <div class="cmj-section-label">
            <span class="cmj-section-badge">SECTION 2</span>
            <h2>Original Article</h2>
            <span class="cmj-section-hint">Select any word or sentence to save it</span>
        </div>
        <h1 class="cmj-oa-title">${escapeMarkup(meta.title)}</h1>
        ${meta.subtitle ? `<p class="cmj-oa-subtitle">${escapeMarkup(meta.subtitle)}</p>` : ""}
        <div class="cmj-oa-author">
            ${renderAvatar(meta, "cmj-oa")}
            <div class="cmj-oa-author-copy">
                <strong>${escapeMarkup(meta.author || "Author not provided")}</strong>
                <span>${escapeMarkup(byline)}</span>
            </div>
        </div>
        ${meta.image ? `<figure class="cmj-oa-hero"><img src="${escapeMarkup(meta.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></figure>` : ""}
    </header>`;
}

/**
 * Build a CDN-independent identity for an image so resized copies match.
 * Publishers such as Substack embed the original file name inside a resize URL
 * (".../w_1456,c_limit/https%3A%2F%2Fbucket%2Fphoto_1536x1024.png"), so the
 * decoded file name, minus size suffixes and extension, is the stable part.
 * @param {string} url Image URL (absolute or relative).
 * @param {string} baseUrl Base used to resolve relative URLs.
 * @returns {string} Comparable key, or "" when the URL is invalid.
 */
function imageAssetKey(url, baseUrl) {
    try {
        const parsed = new URL(url, baseUrl);
        let decoded = parsed.pathname;
        try { decoded = decodeURIComponent(decoded); } catch { /* Keep the raw path when it is not valid percent-encoding. */ }
        const fileName = decoded.split("/").filter(Boolean).pop() || "";
        return fileName
            .replace(/\.[a-z0-9]{2,5}$/i, "")
            .replace(/[-_@]\d+x(?:\d+)?$/i, "")
            .replace(/[-_]\d+x\d+$/i, "")
            .toLowerCase();
    } catch {
        return "";
    }
}

/**
 * Decide whether two image URLs point at the same asset, ignoring CDN resize
 * parameters and query strings.
 * @param {string} first First image URL.
 * @param {string} second Second image URL.
 * @param {string} baseUrl Base used to resolve relative URLs.
 * @returns {boolean} True when both URLs identify the same image.
 */
function isSameImage(first, second, baseUrl) {
    const a = imageAssetKey(first, baseUrl);
    const b = imageAssetKey(second, baseUrl);
    return Boolean(a) && a === b;
}

/**
 * Collect "leaf" elements (no element children) in document order. Publisher
 * chrome (labels, avatars, dates) always lives in leaves, so scanning leaves
 * avoids guessing at wrapper structure.
 * @param {Element} root Parsed article body.
 * @returns {Element[]} Leaf elements in reading order.
 */
function collectLeafBlocks(root) {
    const leaves = [];
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.firstElementChild) leaves.push(node);
    }
    return leaves;
}

/**
 * Remove ancestors left empty after chrome removal, stopping at `root`.
 * @param {Element|null} node Parent of a removed element.
 * @param {Element} root Boundary that is never removed.
 */
function pruneEmptyAncestors(node, root) {
    let current = node;
    while (current && current !== root && !current.textContent.trim() && !current.querySelector("img, video, picture, figure")) {
        const parent = current.parentElement;
        current.remove();
        current = parent;
    }
}

/**
 * Whether a leaf's text is publisher chrome: a UI label ("Search", "read"),
 * the author's name, the publication date, or a read-time / "3 days ago" label.
 * @param {string} text Normalised leaf text.
 * @param {{author: string, published: string}} known Normalised author and date.
 * @returns {boolean} True when the text is chrome.
 */
function isChromeText(text, known) {
    if (!text) return false;
    return CHROME_LABEL_PATTERN.test(text)
        || (known.author && text.length <= known.author.length + 10 && text.includes(known.author))
        || (known.published && text === known.published)
        || (text.length <= 80 && CHROME_META_PATTERN.test(text));
}

/**
 * Classify the leading leaf blocks of an article body as publisher chrome.
 * Scanning stops at the first substantial paragraph, which is real content.
 * An image is an avatar when it is small, matches the known author photo, names
 * the author in its alt text, or sits right before author / date chrome.
 * @param {Element} root Parsed article body.
 * @param {object} article Saved article record.
 * @returns {{leaf: Element, kind: "avatar"|"chrome"}[]} Chrome leaves in reading order.
 */
function classifyLeadingChrome(root, article) {
    const baseUrl = article.contentBaseUrl || article.url || globalThis.location?.href;
    const known = {
        author: normalizeText(article.author),
        published: normalizeText(formatPublishedDate(article.publishedAt || article.datePublished || article.date || ""))
    };
    const cover = String(article.image || article.thumbnail || "").trim();
    const leaves = collectLeafBlocks(root).slice(0, MAX_LEADING_BLOCKS);
    const found = [];

    leaves.forEach((leaf, index) => {
        const text = normalizeText(leaf.textContent);
        if (leaf.tagName !== "IMG") {
            if (isChromeText(text, known)) found.push({ leaf, kind: "chrome" });
            return;
        }
        const src = leaf.getAttribute("src") || "";
        const width = Number(leaf.getAttribute("width")) || 0;
        const isCover = cover && isSameImage(src, cover, baseUrl);
        const followedByChrome = leaves.slice(index + 1, index + 6)
            .some((next) => next.tagName !== "IMG" && isChromeText(normalizeText(next.textContent), known));
        const looksLikeAvatar = (width && width <= AVATAR_MAX_DIMENSION)
            || (article.authorImage && isSameImage(src, article.authorImage, baseUrl))
            || (known.author && normalizeText(leaf.getAttribute("alt")).includes(known.author))
            || followedByChrome;
        if (!isCover && looksLikeAvatar) found.push({ leaf, kind: "avatar" });
    });

    // Stop at real content: drop anything found after the first substantial text leaf.
    const firstContent = leaves.findIndex((leaf) =>
        leaf.tagName !== "IMG" && normalizeText(leaf.textContent).length >= CONTENT_TEXT_THRESHOLD);
    if (firstContent < 0) return found;
    return found.filter((entry) => leaves.indexOf(entry.leaf) < firstContent);
}

/**
 * Locate the publisher byline block ("avatar, Author, 3 days ago, 6 min read").
 *
 * Publishers mix elements and bare text nodes in one container, so element-leaf
 * scanning is not enough. This walks TEXT nodes near the top of the body, finds
 * a read-time or relative-date label, then climbs to the largest ancestor that
 * is still byline-sized. That ancestor holds the avatar, author link and labels
 * together and can be removed as one unit.
 * @param {Element} root Parsed article body.
 * @returns {{container: Element, avatarSrc: string}|null} The block, or null.
 */
function findBylineBlock(root) {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let inspected = 0;
    while (walker.nextNode()) {
        const text = normalizeText(walker.currentNode.nodeValue);
        if (!text) continue;
        if (++inspected > BYLINE_MAX_TEXT_NODES) return null;
        if (text.length > 80 || !CHROME_META_PATTERN.test(text)) continue;

        // Climb while the ancestor stays byline-sized and is not the root itself.
        let container = walker.currentNode.parentElement;
        while (container && container !== root
            && container.parentElement && container.parentElement !== root
            && container.parentElement.textContent.trim().length <= BYLINE_MAX_TEXT) {
            container = container.parentElement;
        }
        if (!container || container === root) return null;
        const avatar = container.querySelector("img");
        return { container, avatarSrc: avatar ? (avatar.getAttribute("src") || "") : "" };
    }
    return null;
}

/**
 * Find the author's photo embedded in the article body when the scraper did
 * not store one. Used so the headers show the real photo instead of an initial.
 * @param {object} article Saved article record.
 * @returns {string} Absolute image URL, or "" when none is found.
 */
export function detectAuthorPhoto(article = {}) {
    if (!article.html) return "";
    const base = article.contentBaseUrl || article.url || "";
    const parsed = new DOMParser().parseFromString(article.html, "text/html");
    const byline = findBylineBlock(parsed.body);
    if (byline?.avatarSrc) return safeHttpUrl(byline.avatarSrc, base);
    const avatar = classifyLeadingChrome(parsed.body, article).find((entry) => entry.kind === "avatar");
    return avatar ? safeHttpUrl(avatar.leaf.getAttribute("src") || "", base) : "";
}

/**
 * Strip content that Section 1 and the Section 2 header already display, so
 * nothing appears twice: publisher chrome (labels, avatar, byline, relative
 * dates, read time), the duplicate title/subtitle and the duplicate lead image.
 * Mutates `root` in place and returns it for chaining.
 * @param {Element} root Parsed article body to clean.
 * @param {object} article Saved article record (supplies title, author, image).
 * @returns {Element} The same `root`, cleaned.
 */
export function stripPublisherChrome(root, article = {}) {
    const baseUrl = article.contentBaseUrl || article.url || globalThis.location?.href;

    // A. Duplicate title heading (removed first so it cannot hide the byline).
    const expectedTitle = normalizeText(article.title);
    const firstHeading = root.querySelector("h1, h2");
    if (firstHeading && expectedTitle && normalizeText(firstHeading.textContent) === expectedTitle) {
        firstHeading.remove();
    }

    // B. Duplicate subtitle / description paragraph.
    const expectedSubtitle = normalizeText(article.subtitle || article.description);
    const firstParagraph = root.querySelector("p");
    if (firstParagraph && expectedSubtitle && normalizeText(firstParagraph.textContent) === expectedSubtitle) {
        firstParagraph.remove();
    }

    // 0. The byline block as a unit, plus the labels and lead image around it.
    const cover0 = String(article.image || article.thumbnail || "").trim();
    const byline = findBylineBlock(root);
    let removedByline = false;
    if (byline) {
        const { container } = byline;
        // Standalone labels immediately before the byline (for example "Search").
        let previous = container.previousElementSibling;
        while (previous && CHROME_LABEL_PATTERN.test(normalizeText(previous.textContent)) && !previous.querySelector("img")) {
            const toRemove = previous;
            previous = previous.previousElementSibling;
            toRemove.remove();
        }
        // The image directly after the byline is the publisher's copy of the lead image.
        const next = container.nextElementSibling;
        const nextImage = next?.matches("img") ? next : next?.querySelector("img");
        if (cover0 && next && nextImage && !normalizeText(next.textContent)) next.remove();
        const parent = container.parentElement;
        container.remove();
        pruneEmptyAncestors(parent, root);
        removedByline = true;
    }

    // 1. Publisher widgets (avatar, author link, date, read time) before the content.
    const chrome = classifyLeadingChrome(root, article);
    for (const { leaf } of chrome) {
        const parent = leaf.parentElement;
        leaf.remove();
        pruneEmptyAncestors(parent, root);
    }

    // 4. Duplicate lead image. It matches the cover by file identity, or, when a
    //    byline block was just removed, it is the first image before any text.
    const cover = String(article.image || article.thumbnail || "").trim();
    const firstImage = root.querySelector("img");
    if (cover && firstImage) {
        const precedesText = !Array.from(root.querySelectorAll("p, h2, h3, h4, li, blockquote"))
            .some((block) => block.compareDocumentPosition(firstImage) & Node.DOCUMENT_POSITION_FOLLOWING
                && block.textContent.trim().length >= CONTENT_TEXT_THRESHOLD);
        const duplicatesCover = isSameImage(firstImage.getAttribute("src") || "", cover, baseUrl)
            || ((chrome.length > 0 || removedByline) && precedesText);
        if (duplicatesCover) {
            const wrapper = firstImage.closest("figure");
            const parent = (wrapper || firstImage).parentElement;
            (wrapper || firstImage).remove();
            pruneEmptyAncestors(parent, root);
        }
    }
    return root;
}

/** Guards against registering the document-level listeners more than once. */
let behavioursInstalled = false;

/**
 * Install the small amount of behaviour the shared markup needs, using event
 * delegation so it keeps working after the views re-render. Manifest V3 pages
 * forbid inline handlers, so this replaces `onerror` and `onclick` attributes.
 * Safe to call repeatedly.
 */
export function installArticleBehaviours() {
    if (behavioursInstalled) return;
    behavioursInstalled = true;

    // Broken author photos become an initial avatar; broken images are hidden.
    document.addEventListener("error", (event) => {
        const image = event.target;
        if (!(image instanceof HTMLImageElement)) return;
        if (image.matches(".cmj-author-photo")) {
            const fallback = document.createElement("span");
            fallback.className = `${image.className.split(" ")[0]} ${image.className.split(" ")[0]}-fallback`;
            fallback.setAttribute("role", "img");
            fallback.setAttribute("aria-label", "Author photo unavailable");
            fallback.textContent = (image.alt || "A").trim().slice(0, 1).toUpperCase();
            image.replaceWith(fallback);
        } else if (image.matches(".cmj-ad-thumb-image, .cmj-oa-hero img")) {
            image.closest("figure")?.setAttribute("hidden", "");
        }
    }, true);

    // "Show more" / "Show less" toggle for long descriptions.
    document.addEventListener("click", (event) => {
        const button = event.target instanceof Element ? event.target.closest("[data-cmj-toggle-description]") : null;
        if (!button) return;
        const description = button.parentElement?.querySelector(".cmj-ad-description");
        if (!description) return;
        const expanded = button.getAttribute("aria-expanded") === "true";
        description.dataset.clamped = String(expanded);
        button.setAttribute("aria-expanded", String(!expanded));
        button.textContent = expanded ? "Show more" : "Show less";
    });
}
