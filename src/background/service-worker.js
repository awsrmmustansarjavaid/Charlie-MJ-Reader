/** Background event handlers for quick actions and context-menu capture. */
async function seedFromBundle() {
  try {
    const url = chrome.runtime.getURL("database/websites/charlie-mj-websites.json");
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return;
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
  } catch {
    // Seed data is optional; extension startup must not fail if it cannot be read.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  seedFromBundle().catch(() => {}); // load the bundled starter website list (adds only missing sites)
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
  if (!tab?.id) return;
  const selection = info.selectionText || "";
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: selection ? "CMJ_SAVE_SELECTION" : "CMJ_SAVE_PAGE",
      selection
    });
  } catch {
    // Restricted browser pages cannot host content scripts; the popup remains available.
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {

    if (message?.type === "CMJ_MEDIUM_AUTO_OPEN") {
      const stored = await chrome.storage.local.get("settings");
      const s = stored.settings || {};
      const target = String(s.freediumServiceUrl || "").trim();
      if (!/^https:\/\//i.test(target)) throw new Error("Freedium service URL must use HTTPS.");
      const base = new URL(target);
      const original = String(message.canonicalUrl || message.url || "").trim();
      if (!/^https?:\/\//i.test(original)) throw new Error("Invalid Medium article URL.");
      const join = base.href.endsWith("/") ? base.href : base.href + "/";
      // Freedium expects the complete Medium URL as the path. Do not encode the
      // entire URL, otherwise the service receives https%3A%2F%2Fmedium.com...
      const freedium = join + original.replace(/^https?:\/\//i, match => match).replace(/^\/+/, "");
      await chrome.tabs.create({url: freedium});
      sendResponse({ok:true,url:freedium});
      return;
    }

    if (message?.type === "CMJ_FETCH_FREEDIUM_HTML") {
      const source = String(message.sourceUrl || "").trim();
      if (!/^https?:\/\//i.test(source)) throw new Error("Invalid source URL.");
      const sourceUrl = new URL(source);
      const isMedium = sourceUrl.hostname === "medium.com" || sourceUrl.hostname.endsWith(".medium.com");
      const isFreedium = /(^|\.)freedium-mirror\.cfd$/i.test(sourceUrl.hostname);
      if (!isMedium && !isFreedium) throw new Error("Unsupported article host.");
      let target = source;
      if (isMedium) {
        const stored = await chrome.storage.local.get(["settings"]);
        const configured = String(stored.settings?.freediumServiceUrl || "https://freedium-mirror.cfd/").trim();
        if (!/^https:\/\//i.test(configured)) throw new Error("Freedium service URL must use HTTPS.");
        const base = configured.endsWith("/") ? configured : configured + "/";
        target = base + source;
      }
      const response = await fetch(target, {
        method: "GET",
        redirect: "follow",
        credentials: "omit",
        headers: { "Accept": "text/html,application/xhtml+xml" },
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`Freedium returned HTTP ${response.status}.`);
      const html = await response.text();
      if (!html || html.length < 1000) throw new Error("Freedium returned an unexpectedly small document.");
      sendResponse({ok:true, html, url:target, finalUrl:response.url || target});
      return;
    }

    if (message?.type === "CMJ_TRANSLATE_TEXT") {
      const text = String(message.text || "").trim();
      if (!text) throw new Error("Select some text first.");
      if (text.length > 1800) throw new Error("Please translate a shorter selection (maximum 1,800 characters).");
      const stored = await chrome.storage.local.get("settings");
      const settings = stored.settings || {};
      const source = settings.translationSource || "tr";
      const target = settings.translationTarget || "en";
      const endpoint = new URL("https://api.mymemory.translated.net/get");
      endpoint.searchParams.set("q", text);
      endpoint.searchParams.set("langpair", `${source}|${target}`);
      const response = await fetch(endpoint.toString(), { headers: { "Accept": "application/json" } });
      if (!response.ok) throw new Error(`Translation service returned HTTP ${response.status}.`);
      const payload = await response.json();
      const translation = payload?.responseData?.translatedText;
      if (!translation || payload?.responseStatus >= 400) throw new Error(payload?.responseDetails || "No translation was returned.");
      sendResponse({ ok: true, translation, source, target });
      return;
    }

    if (message?.type === "CMJ_SAVE_VOCABULARY") {
      const word = String(message.word || message.text || "").trim();
      if (!word) throw new Error("No selected text was provided.");
      const stored = await chrome.storage.local.get(["vocabulary"]);
      const vocabulary = Array.isArray(stored.vocabulary) ? stored.vocabulary : [];
      const existing = vocabulary.find(item => item.word?.toLocaleLowerCase() === word.toLocaleLowerCase());
      if (existing) {
        if (message.translation && !existing.translation) existing.translation = message.translation;
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

    if (message?.type === "CMJ_OPEN_READER") {
      let articleId = "";
      if (message.article?.text) {
        const stored = await chrome.storage.local.get(["articles"]);
        const articles = Array.isArray(stored.articles) ? stored.articles : [];
        const existing = articles.find(item => item.url === message.article.url);
        const article = existing || {
          id: crypto.randomUUID(), ...message.article,
          savedAt: message.article.savedAt || new Date().toISOString(),
          status: "unread", progress: 0
        };
        articleId = article.id;
        if (!existing) await chrome.storage.local.set({ articles: [article, ...articles] });
      }
      const target = chrome.runtime.getURL(
        `src/reader/reader.html${articleId ? `?articleId=${encodeURIComponent(articleId)}` : ""}#${message.mode === "reader" ? "reader" : "media"}`
      );
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
      if (message.type === "CMJ_SAVE_HIGHLIGHT" || !list.some(entry => entry.url === item.url)) {
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
