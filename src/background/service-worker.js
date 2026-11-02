// Supported Websites gate (shared with the content script and popup).
importScripts("../lib/site-gate.js");
// Link Context Menu: right-click a link -> "Charlie MJ Reader" submenu (open in Reader Workspace / save article).
// Must stay near the top so the menu is registered every time the service worker starts.
importScripts("link-context-menu.js");
/** Background event handlers for quick actions and context-menu capture. */
// ---------------------------------------------------------------------------
// Sleep mode: the extension acts only on Supported Websites.
// ---------------------------------------------------------------------------
const Gate = globalThis.CMJSiteGate;
const SLEEP_TITLE = "Charlie MJ Reader is sleeping on this website. Add it to Supported Websites to activate it.";
async function loadSettings() {
    try {
        return (await chrome.storage.local.get("settings")).settings || {};
    }
    catch {
        return {};
    }
}
async function updateBadge(tab, settings) {
    if (!tab?.id)
        return;
    try {
        const isWeb = /^https?:\/\//i.test(tab.url || "");
        if (!isWeb) {
            await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
            await chrome.action.setTitle({ tabId: tab.id, title: "Charlie MJ Reader" });
            return;
        }
        const supported = Gate.isSupported(settings || await loadSettings(), tab.url);
        await chrome.action.setBadgeText({ tabId: tab.id, text: supported ? "" : "zzz" });
        if (!supported)
            await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#6b7280" });
        await chrome.action.setTitle({ tabId: tab.id, title: supported ? "Charlie MJ Reader — active on this website" : SLEEP_TITLE });
    }
    catch { /* the tab may have closed */ }
}
async function updateAllBadges() {
    const settings = await loadSettings();
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map(tab => updateBadge(tab, settings)));
}
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.status || change.url)
        updateBadge(tab);
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
        updateBadge(await chrome.tabs.get(tabId));
    }
    catch { }
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings)
        updateAllBadges();
});
chrome.runtime.onStartup.addListener(() => { updateAllBadges(); });
/** After install / update / reload, wake supported tabs that are already open (no manual refresh needed). */
async function wakeOpenSupportedTabs() {
    const settings = await loadSettings();
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
        if (!Gate.isSupported(settings, tab.url))
            continue;
        try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/lib/reading-engine.js", "src/lib/site-gate.js", "src/content/content.js"] });
        }
        catch { /* restricted page */ }
    }
}
async function seedFromBundle() {
    try {
        const url = chrome.runtime.getURL("database/websites/charlie-mj-websites.json");
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok)
            return;
        const bundle = await response.json();
        const stored = await chrome.storage.local.get(["settings"]);
        const settings = stored.settings || {};
        const websites = Array.isArray(settings.websites) ? settings.websites : [];
        const existing = new Set(websites.map(item => typeof item === "string" ? item.toLowerCase() : String(item?.domain || "").toLowerCase()).filter(Boolean));
        const incoming = Array.isArray(bundle) ? bundle : Array.isArray(bundle?.websites) ? bundle.websites : [];
        const additions = incoming.filter(item => {
            const domain = typeof item === "string" ? item : item?.domain;
            return domain && !existing.has(String(domain).toLowerCase());
        });
        if (additions.length) {
            await chrome.storage.local.set({ settings: { ...settings, websites: [...websites, ...additions] } });
        }
    }
    catch {
        // Seed data is optional; extension startup must not fail if it cannot be read.
    }
}
chrome.runtime.onInstalled.addListener(() => {
    seedFromBundle().then(() => { updateAllBadges(); wakeOpenSupportedTabs(); }).catch(() => { }); // load the bundled starter website list (adds only missing sites)
    chrome.contextMenus.create({
        id: "cmj-save-selection", title: "Save selection to Charlie MJ Reader",
        contexts: ["selection"]
    });
    chrome.contextMenus.create({
        id: "cmj-save-page", title: "Save page to Charlie MJ Reader",
        contexts: ["page"]
    });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // Ignore clicks on the Link Context Menu items (ids start with "cmj-link-"); link-context-menu.js handles them.
    if (!tab?.id || String(info.menuItemId).startsWith("cmj-link-"))
        return;
    const selection = info.selectionText || "";
    try {
        const reply = await chrome.tabs.sendMessage(tab.id, {
            type: selection ? "CMJ_SAVE_SELECTION" : "CMJ_SAVE_PAGE",
            selection
        });
        if (!reply)
            throw new Error("no reply");
    }
    catch {
        // No page script answered: the site is not in Supported Websites (sleeping) or the page is restricted.
        try {
            await chrome.notifications.create({
                type: "basic", iconUrl: chrome.runtime.getURL("assets/icons/icon128.png"),
                title: "Charlie MJ Reader is sleeping", message: "This website is not in your Supported Websites list."
            });
        }
        catch { /* notifications are optional */ }
    }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        // Styles are removed whenever a page goes back to sleep (even if the site was just removed).
        if (message?.type === "CMJ_REMOVE_CSS" && sender?.tab?.id != null) {
            try {
                await chrome.scripting.removeCSS({ target: { tabId: sender.tab.id }, files: ["src/content/content.css"] });
            }
            catch { }
            sendResponse({ ok: true });
            return;
        }
        // Requests that come from a web page are honoured only for Supported Websites.
        const senderUrl = sender?.tab?.url || "";
        if (/^https?:\/\//i.test(senderUrl) && !Gate.isSupported(await loadSettings(), senderUrl)) {
            throw new Error("Charlie MJ Reader is sleeping on this website.");
        }
        if (message?.type === "CMJ_INJECT_CSS" && sender?.tab?.id != null) {
            try {
                await chrome.scripting.removeCSS({ target: { tabId: sender.tab.id }, files: ["src/content/content.css"] });
            }
            catch { }
            await chrome.scripting.insertCSS({ target: { tabId: sender.tab.id }, files: ["src/content/content.css"] });
            sendResponse({ ok: true });
            return;
        }
        if (message?.type === "CMJ_MEDIUM_AUTO_OPEN") {
            const stored = await chrome.storage.local.get("settings");
            const s = stored.settings || {};
            const target = String(s.freediumServiceUrl || "").trim();
            if (!/^https:\/\//i.test(target))
                throw new Error("Freedium service URL must use HTTPS.");
            const base = new URL(target);
            const original = String(message.canonicalUrl || message.url || "").trim();
            if (!/^https?:\/\//i.test(original))
                throw new Error("Invalid Medium article URL.");
            const join = base.href.endsWith("/") ? base.href : base.href + "/";
            // Freedium expects the complete Medium URL as the path. Do not encode the
            // entire URL, otherwise the service receives https%3A%2F%2Fmedium.com...
            const freedium = join + original.replace(/^https?:\/\//i, match => match).replace(/^\/+/, "");
            await chrome.tabs.create({ url: freedium });
            sendResponse({ ok: true, url: freedium });
            return;
        }
        if (message?.type === "CMJ_FETCH_FREEDIUM_HTML") {
            const source = String(message.sourceUrl || "").trim();
            if (!/^https?:\/\//i.test(source))
                throw new Error("Invalid source URL.");
            const sourceUrl = new URL(source);
            const isMedium = sourceUrl.hostname === "medium.com" || sourceUrl.hostname.endsWith(".medium.com");
            const isFreedium = /(^|\.)freedium-mirror\.cfd$/i.test(sourceUrl.hostname);
            if (!isMedium && !isFreedium)
                throw new Error("Unsupported article host.");
            let target = source;
            if (isMedium) {
                const stored = await chrome.storage.local.get(["settings"]);
                const configured = String(stored.settings?.freediumServiceUrl || "https://freedium-mirror.cfd/").trim();
                if (!/^https:\/\//i.test(configured))
                    throw new Error("Freedium service URL must use HTTPS.");
                const base = configured.endsWith("/") ? configured : configured + "/";
                target = base + source;
            }
            // Retry transient failures (rate limit / gateway errors / challenge pages) before giving up.
            let response = null, html = "", lastError = "";
            for (let attempt = 0; attempt < 3; attempt++) {
                if (attempt)
                    await new Promise(r => setTimeout(r, 700 * attempt));
                try {
                    response = await fetch(target, {
                        method: "GET", redirect: "follow", credentials: "omit",
                        headers: { "Accept": "text/html,application/xhtml+xml" }, cache: "no-store"
                    });
                }
                catch (err) {
                    lastError = String(err?.message || err);
                    response = null;
                    continue;
                }
                if (response.status === 429 || response.status >= 500) {
                    lastError = `Freedium returned HTTP ${response.status}.`;
                    continue;
                }
                if (!response.ok)
                    throw new Error(`Freedium returned HTTP ${response.status}.`);
                html = await response.text();
                if (/<title>\s*(just a moment|attention required)/i.test(html) && !/<article/i.test(html)) {
                    lastError = "Freedium returned a verification page.";
                    html = "";
                    continue;
                }
                break;
            }
            if (!response || !response.ok)
                throw new Error(lastError || "Could not reach Freedium.");
            if (!html || !html.trim())
                throw new Error(lastError || "Freedium returned an empty document.");
            sendResponse({ ok: true, html, url: target, finalUrl: response.url || target });
            return;
        }
        if (message?.type === "CMJ_TRANSLATE_TEXT") {
            const text = String(message.text || "").trim();
            if (!text)
                throw new Error("Select some text first.");
            if (text.length > 1800)
                throw new Error("Please translate a shorter selection (maximum 1,800 characters).");
            const stored = await chrome.storage.local.get("settings");
            const settings = stored.settings || {};
            const source = settings.translationSource || "tr";
            const target = settings.translationTarget || "en";
            const endpoint = new URL("https://api.mymemory.translated.net/get");
            endpoint.searchParams.set("q", text);
            endpoint.searchParams.set("langpair", `${source}|${target}`);
            const response = await fetch(endpoint.toString(), { headers: { "Accept": "application/json" } });
            if (!response.ok)
                throw new Error(`Translation service returned HTTP ${response.status}.`);
            const payload = await response.json();
            const translation = payload?.responseData?.translatedText;
            if (!translation || payload?.responseStatus >= 400)
                throw new Error(payload?.responseDetails || "No translation was returned.");
            sendResponse({ ok: true, translation, source, target });
            return;
        }
        if (message?.type === "CMJ_SAVE_VOCABULARY") {
            const word = String(message.word || message.text || "").trim();
            if (!word)
                throw new Error("No selected text was provided.");
            const stored = await chrome.storage.local.get(["vocabulary"]);
            const vocabulary = Array.isArray(stored.vocabulary) ? stored.vocabulary : [];
            const existing = vocabulary.find(item => item.word?.toLocaleLowerCase() === word.toLocaleLowerCase());
            if (existing) {
                if (message.translation && !existing.translation)
                    existing.translation = message.translation;
                existing.updatedAt = new Date().toISOString();
                await chrome.storage.local.set({ vocabulary });
                sendResponse({ ok: true, duplicate: true, id: existing.id });
                return;
            }
            const article = message.article || {};
            const entry = {
                id: crypto.randomUUID(), word,
                translation: String(message.translation || ""),
                definition: "", example: word, exampleTranslation: "",
                partOfSpeech: "", pronunciation: "", synonyms: "", notes: "",
                categoryId: "", tags: [], source: article.domain || "Manual",
                url: article.url || sender.tab?.url || "", sourceTitle: article.title || "",
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                status: "new", reviewCount: 0, nextReviewAt: null
            };
            await chrome.storage.local.set({ vocabulary: [entry, ...vocabulary] });
            sendResponse({ ok: true, id: entry.id });
            return;
        }
        if (message?.type === "CMJ_OPEN_LANGUAGE_LEARNING") {
            // Persist the active page as a learning article before opening the reader.
            // Canonical URL matching prevents repeated toolbar clicks from creating duplicates.
            const incoming = message.article || {};
            let articleId = "";
            if (incoming.url && incoming.text) {
                const stored = await chrome.storage.local.get(["articles", "settings"]);
                const articles = Array.isArray(stored.articles) ? stored.articles : [];
                const canonical = incoming.canonicalUrl || incoming.url;
                const normalize = value => String(value || "").replace(/#.*$/, "").replace(/\/$/, "");
                const existing = articles.find(item =>
                    normalize(item.canonicalUrl || item.url) === normalize(canonical)
                );
                if (existing) {
                    articleId = existing.id;
                    // Refresh metadata/content only when the incoming extraction is at least as complete.
                    if ((incoming.wordCount || 0) >= (existing.wordCount || 0)) {
                        const keep = { id: existing.id, savedAt: existing.savedAt, status: existing.status, progress: existing.progress };
                        Object.assign(existing, incoming, keep, { languageLearning: true, learningSource: "toolbar" });
                        await chrome.storage.local.set({ articles });
                    } else {
                        existing.languageLearning = true;
                        existing.learningSource = "toolbar";
                        await chrome.storage.local.set({ articles });
                    }
                } else {
                    articleId = incoming.id || crypto.randomUUID();
                    articles.unshift({ ...incoming, id: articleId, languageLearning: true,
                        learningSource: "toolbar", savedAt: incoming.savedAt || new Date().toISOString(),
                        status: "unread", progress: 0 });
                    await chrome.storage.local.set({ articles });
                }
            }
            const targetUrl = chrome.runtime.getURL(
                `src/language-learning/language-learning.html${articleId ? `?article=${encodeURIComponent(articleId)}` : ""}`
            );
            const tab = await chrome.tabs.create({ url: targetUrl, active: true });
            sendResponse({ ok: true, tabId: tab.id, articleId });
            return;
        }
        if (message?.type === "CMJ_OPEN_READER") {
            let articleId = "";
            if (message.article?.text) {
                const stored = await chrome.storage.local.get(["articles"]);
                const articles = Array.isArray(stored.articles) ? stored.articles : [];
                const same = item => item.url === message.article.url || (message.article.canonicalUrl && item.canonicalUrl === message.article.canonicalUrl);
                const existing = articles.find(same);
                const article = existing || {
                    id: crypto.randomUUID(), ...message.article,
                    savedAt: message.article.savedAt || new Date().toISOString(),
                    status: "unread", progress: 0
                };
                articleId = article.id;
                if (!existing)
                    await chrome.storage.local.set({ articles: [article, ...articles] });
                else if ((message.article.wordCount || 0) > (existing.wordCount || 0)) {
                    // A previously saved copy was incomplete: replace its content, keep id/progress/status.
                    Object.assign(existing, message.article, { id: existing.id, savedAt: existing.savedAt, status: existing.status, progress: existing.progress, category: existing.category || message.article.category });
                    await chrome.storage.local.set({ articles });
                }
            }
            const target = chrome.runtime.getURL(`src/reader/reader.html${articleId ? `?articleId=${encodeURIComponent(articleId)}` : ""}#${message.mode === "reader" ? "reader" : "media"}`);
            await chrome.tabs.create({ url: target });
            sendResponse({ ok: true, articleId });
            return;
        }
        if (message?.type === "CMJ_NOTIFY" && message.title) {
            await chrome.notifications.create({
                type: "basic", iconUrl: chrome.runtime.getURL("assets/icons/icon128.png"),
                title: message.title, message: message.message || ""
            });
            sendResponse({ ok: true });
            return;
        }
        if (["CMJ_SAVE_ARTICLE", "CMJ_CACHE_ARTICLE", "CMJ_SAVE_HIGHLIGHT"].includes(message?.type)) {
            const stored = await chrome.storage.local.get(null);
            const section = message.type === "CMJ_SAVE_HIGHLIGHT" ? "highlights" : "articles";
            const list = Array.isArray(stored[section]) ? stored[section] : [];
            const item = message.type === "CMJ_SAVE_HIGHLIGHT"
                ? { id: crypto.randomUUID(), text: message.text, url: message.article?.url, title: message.article?.title, createdAt: new Date().toISOString(), color: "yellow" }
                : { id: crypto.randomUUID(), ...message.article };
            const dup = section === "articles" ? list.find(entry => entry.url === item.url) : null;
            if (dup && (item.wordCount || 0) > (dup.wordCount || 0)) {
                Object.assign(dup, item, { id: dup.id, savedAt: dup.savedAt, status: dup.status, progress: dup.progress });
                await chrome.storage.local.set({ [section]: list });
            }
            else if (message.type === "CMJ_SAVE_HIGHLIGHT" || !dup) {
                await chrome.storage.local.set({ [section]: [item, ...list] });
            }
            sendResponse({ ok: true });
            return;
        }
        if (message?.type === "CMJ_LOOKUP_WORD") {
            await chrome.tabs.create({ url: "https://api.dictionaryapi.dev/" });
            sendResponse({ ok: true });
        }
    })().catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
});
