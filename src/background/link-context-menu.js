/**
 * Charlie MJ Reader — Link Context Menu
 *
 * Adds a "Charlie MJ Reader" entry to Chrome's right-click menu on any LINK, with two choices:
 *   1. Open article in Reader Workspace
 *   2. Save article to Saved Articles
 *
 * How it works (no DOMParser needed in the service worker):
 *   - The linked page is opened in a hidden background tab, the extension's own content script
 *     extracts the article (same extraction as the toolbar / popup), and the tab is closed again.
 *   - medium.com links are loaded through the configured Freedium mirror so the full story is captured.
 *   - The article is stored in chrome.storage.local -> "articles" (the same list as the Article Library,
 *     My Reading Library > Saved Articles and See Saved). Existing copies are refreshed if the new
 *     capture is longer, never duplicated.
 *
 * Load with:  importScripts("link-context-menu.js");   (see the one-line guard note in the instructions)
 * Classic script (no import/export) so it works in a non-module MV3 service worker.
 */
(() => {
  "use strict";

  const IDS = {
    root: "cmj-link-root",
    open: "cmj-link-open",
    save: "cmj-link-save"
  };
  const DEFAULT_FREEDIUM = "https://freedium-mirror.cfd/";
  const PAGE_LOAD_TIMEOUT_MS = 35000;
  const EXTRACT_ATTEMPTS = 10;
  const EXTRACT_RETRY_MS = 800;
  const inFlight = new Set();

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  /* ---------------------------------------------------------------- menus */

  function removeMenu(id) {
    return new Promise(resolve => {
      try { chrome.contextMenus.remove(id, () => { void chrome.runtime.lastError; resolve(); }); }
      catch { resolve(); }
    });
  }

  function createMenu(props) {
    return new Promise(resolve => {
      try { chrome.contextMenus.create(props, () => { void chrome.runtime.lastError; resolve(); }); }
      catch { resolve(); }
    });
  }

  /** Idempotent: removes only this module's items, then recreates them. */
  async function ensureMenus() {
    for (const id of [IDS.open, IDS.save, IDS.root]) await removeMenu(id);
    await createMenu({ id: IDS.root, title: "Charlie MJ Reader", contexts: ["link"] });
    await createMenu({ id: IDS.open, parentId: IDS.root, title: "Open article in Reader Workspace", contexts: ["link"] });
    await createMenu({ id: IDS.save, parentId: IDS.root, title: "Save article to Saved Articles", contexts: ["link"] });
  }

  /* ---------------------------------------------------------------- helpers */

  const isMediumHost = host => host === "medium.com" || host.endsWith(".medium.com");

  function cleanLink(raw) {
    let url;
    try { url = new URL(String(raw || "")); } catch { return null; }
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    // Medium listing links carry tracking queries (?source=...); the article itself does not need them.
    if (isMediumHost(url.hostname.toLowerCase())) url.search = "";
    return url;
  }

  async function getSettings() {
    try { return (await chrome.storage.local.get("settings")).settings || {}; } catch { return {}; }
  }

  /** Medium links are fetched through Freedium (when enabled) so the complete story is captured. */
  function captureTarget(url, settings) {
    if (isMediumHost(url.hostname.toLowerCase()) && settings.freediumEnabled !== false) {
      const service = String(settings.freediumServiceUrl || DEFAULT_FREEDIUM).trim();
      if (/^https:\/\//i.test(service)) return (service.endsWith("/") ? service : service + "/") + url.href;
    }
    return url.href;
  }

  async function notify(title, message) {
    const settings = await getSettings();
    const n = settings.notifications || {};
    if (n.enabled === false) return;
    try {
      await chrome.notifications.create({
        type: "basic", iconUrl: chrome.runtime.getURL("assets/icons/icon128.png"),
        title, message: String(message || "").slice(0, 200)
      });
    } catch { /* notifications are optional */ }
  }

  /* ---------------------------------------------------------------- capture */

  function waitForTabComplete(tabId) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        error ? reject(error) : resolve();
      };
      const onUpdated = (id, change) => { if (id === tabId && change.status === "complete") finish(); };
      const timer = setTimeout(() => finish(new Error("The page took too long to load.")), PAGE_LOAD_TIMEOUT_MS);
      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.get(tabId).then(tab => { if (tab?.status === "complete") finish(); }).catch(() => {});
    });
  }

  /** Last-resort extractor if the content script is not available on that page. */
  function fallbackExtract() {
    const root = document.querySelector("article,main,[role='main']") || document.body;
    const blocks = [...root.querySelectorAll("h1,h2,h3,p,blockquote,li,pre")]
      .map(node => (node.innerText || "").trim()).filter(Boolean);
    const text = blocks.join("\n\n");
    const words = text.split(/\s+/).filter(Boolean).length;
    const meta = (selector, attr = "content") => document.querySelector(selector)?.getAttribute(attr) || "";
    return {
      id: crypto.randomUUID(),
      title: (meta('meta[property="og:title"]') || document.querySelector("h1")?.innerText || document.title || "").trim(),
      url: location.href, domain: location.hostname,
      canonicalUrl: meta('link[rel="canonical"]', "href") || location.href,
      siteName: meta('meta[property="og:site_name"]') || location.hostname,
      text, html: root.innerHTML, contentBaseUrl: location.href,
      wordCount: words, readingMinutes: Math.max(1, Math.ceil(words / 220)),
      author: meta('meta[name="author"]'), image: meta('meta[property="og:image"]'),
      description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
      publishedAt: meta('meta[property="article:published_time"]'),
      category: "General", tags: [], labels: [], savedAt: new Date().toISOString(),
      extractionSource: "link-menu-fallback"
    };
  }

  async function extractFromTab(tabId) {
    let lastError = "";
    for (let attempt = 0; attempt < EXTRACT_ATTEMPTS; attempt++) {
      try {
        const reply = await chrome.tabs.sendMessage(tabId, { type: "CMJ_GET_PAGE_DATA" });
        if (reply?.ok && reply.article?.text?.trim()) return reply.article;
        lastError = reply?.error || "No readable article content found.";
      } catch (error) {
        lastError = String(error?.message || error); // content script not ready yet
      }
      await sleep(EXTRACT_RETRY_MS);
    }
    try {
      const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: fallbackExtract });
      if (result?.result?.text?.trim()) return result.result;
    } catch (error) { lastError = String(error?.message || error); }
    throw new Error(lastError || "No readable article content found.");
  }

  async function captureArticle(url, settings, windowId) {
    const tab = await chrome.tabs.create({ url: captureTarget(url, settings), active: false, windowId });
    try {
      await waitForTabComplete(tab.id);
      await sleep(600); // let document_idle content scripts and lazy content settle
      const article = await extractFromTab(tab.id);
      // Always store the original link as the article URL (not the mirror's URL).
      return { ...article, url: url.href, domain: url.hostname, canonicalUrl: article.canonicalUrl && !/freedium/i.test(article.canonicalUrl) ? article.canonicalUrl : url.href };
    } finally {
      try { await chrome.tabs.remove(tab.id); } catch { /* already closed */ }
    }
  }

  /* ---------------------------------------------------------------- storage */

  /** Adds the article, or refreshes an earlier copy when the new capture is longer. */
  async function upsertArticle(article) {
    const stored = await chrome.storage.local.get(["articles"]);
    const articles = Array.isArray(stored.articles) ? stored.articles : [];
    const same = item => item.url === article.url || (article.canonicalUrl && item.canonicalUrl === article.canonicalUrl);
    const existing = articles.find(same);
    if (existing) {
      if ((article.wordCount || 0) > (existing.wordCount || 0)) {
        Object.assign(existing, article, {
          id: existing.id, savedAt: existing.savedAt, status: existing.status, progress: existing.progress,
          category: existing.category || article.category, fetchedAt: new Date().toISOString()
        });
        await chrome.storage.local.set({ articles });
        return { id: existing.id, existed: true, updated: true };
      }
      return { id: existing.id, existed: true, updated: false };
    }
    const record = {
      ...article, id: crypto.randomUUID(), category: article.category || "General",
      savedAt: new Date().toISOString(), status: "unread", progress: 0
    };
    await chrome.storage.local.set({ articles: [record, ...articles] });
    return { id: record.id, existed: false, updated: false };
  }

  /* ---------------------------------------------------------------- actions */

  async function handle(action, rawLink, sourceTab) {
    const url = cleanLink(rawLink);
    if (!url) { await notify("Charlie MJ Reader", "This link cannot be opened as an article (only http/https links are supported)."); return; }
    const key = `${action}:${url.href}`;
    if (inFlight.has(key)) return;
    inFlight.add(key);
    try {
      const settings = await getSettings();
      const article = await captureArticle(url, settings, sourceTab?.windowId);
      const result = await upsertArticle(article);
      const title = article.title || url.hostname;
      if (action === "open") {
        await chrome.tabs.create({
          url: chrome.runtime.getURL(`src/reader/reader.html?articleId=${encodeURIComponent(result.id)}#reader`)
        });
      } else {
        await notify(
          result.existed ? (result.updated ? "Saved article updated" : "Already in Saved Articles") : "Saved to Saved Articles",
          title
        );
      }
    } catch (error) {
      await notify("Charlie MJ Reader — could not read this link", String(error?.message || error));
    } finally {
      inFlight.delete(key);
    }
  }

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === IDS.open) handle("open", info.linkUrl, tab);
    else if (info.menuItemId === IDS.save) handle("save", info.linkUrl, tab);
  });

  chrome.runtime.onInstalled.addListener(() => { ensureMenus(); });
  chrome.runtime.onStartup?.addListener(() => { ensureMenus(); });
  ensureMenus(); // also on every service-worker start, so a reloaded extension always has the menu
})();
