/**
 * Page bridge: exposes accessible article text and a small configurable toolbar.
 * It intentionally does not alter cookies, paywall state, or server-side quotas.
 */
(() => {
  if (window.__cmjReaderLoaded) return;
  window.__cmjReaderLoaded = true;

  const getArticle = () => {
    const main = document.querySelector("article, main, [role='main']") || document.body;
    const title = document.querySelector('meta[property="og:title"]')?.content ||
      document.querySelector("h1")?.innerText || document.title;
    const image = document.querySelector('meta[property="og:image"]')?.content || "";
    const text = [...main.querySelectorAll("h1,h2,h3,p,blockquote,li,pre")]
      .map(el => el.innerText.trim()).filter(Boolean).join("\n\n");
    return { title, url: location.href, domain: location.hostname, image,
      author: document.querySelector('meta[name="author"]')?.content || "",
      siteName: document.querySelector('meta[property="og:site_name"]')?.content || location.hostname,
      text, wordCount: text.split(/\s+/).filter(Boolean).length,
      readingMinutes: Math.max(1, Math.ceil(text.split(/\s+/).length / 220)),
      savedAt: new Date().toISOString(), status: "unread", progress: 0 };
  };

  const toolbar = document.createElement("aside");
  toolbar.id = "cmj-floating-toolbar";
  toolbar.innerHTML = `
    <button data-action="reader" title="Open reader">▤</button>
    <button data-action="highlight" title="Highlight selection">✎</button>
    <button data-action="listen" title="Listen">♫</button>
    <button data-action="save" title="Save article">＋</button>
    <button data-action="dictionary" title="Define selected word">Aa</button>
    <button data-action="close" title="Hide toolbar">×</button>`;
  document.documentElement.append(toolbar);

  toolbar.addEventListener("click", async event => {
    const action = event.target.closest("button")?.dataset.action;
    if (!action) return;
    if (action === "close") { toolbar.hidden = true; return; }
    if (action === "save") {
      const article = getArticle();
      await chrome.runtime.sendMessage({ type: "CMJ_SAVE_ARTICLE", article });
      event.target.textContent = "✓";
    }
    if (action === "reader" || action === "listen") {
      // Route page-toolbar reading into the full workspace so its real media
      // controls remain visible alongside the synchronized article text.
      const article = getArticle();
      await chrome.runtime.sendMessage({ type: "CMJ_OPEN_READER", article, autoplay: true });
    }
    if (action === "highlight") {
      const selection = window.getSelection()?.toString().trim();
      if (selection) chrome.runtime.sendMessage({ type: "CMJ_SAVE_HIGHLIGHT", text: selection, article: getArticle() });
      else alert("Select text on the page first.");
    }
    if (action === "dictionary") {
      const word = window.getSelection()?.toString().trim();
      if (!word || word.split(/\s+/).length > 1) { alert("Select one word first."); return; }
      chrome.runtime.sendMessage({ type: "CMJ_LOOKUP_WORD", word });
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "CMJ_SAVE_SELECTION" && message.selection) {
      chrome.runtime.sendMessage({ type: "CMJ_SAVE_HIGHLIGHT", text: message.selection, article: getArticle() });
    }
    if (message.type === "CMJ_SAVE_PAGE") {
      chrome.runtime.sendMessage({ type: "CMJ_SAVE_ARTICLE", article: getArticle() });
    }
  });

  chrome.storage.local.get("settings", ({ settings }) => {
    if (settings?.toolbarEnabled === false) toolbar.hidden = true;
  });
})();
