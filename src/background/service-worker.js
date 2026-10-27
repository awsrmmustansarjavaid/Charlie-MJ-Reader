/** Background event handlers for quick actions and context-menu capture. */
chrome.runtime.onInstalled.addListener(() => {
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
        `src/reader/reader.html${articleId ? `?articleId=${encodeURIComponent(articleId)}` : ""}#media`
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
