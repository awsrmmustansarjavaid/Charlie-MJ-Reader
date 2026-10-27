/** Extracts article-like content from the active page without bypassing access controls. */
export function extractCurrentPage() {
  const selectors = ["article", "main", '[role="main"]', ".post-content", ".article-content"];
  let container = null;
  for (const selector of selectors) {
    const candidate = document.querySelector(selector);
    if (candidate && candidate.innerText.trim().length > 250) { container = candidate; break; }
  }
  container ||= document.body;
  const title = document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector("h1")?.innerText || document.title;
  const image = document.querySelector('meta[property="og:image"]')?.content ||
    document.querySelector("article img, main img")?.src || "";
  const description = document.querySelector('meta[name="description"]')?.content ||
    document.querySelector('meta[property="og:description"]')?.content || "";
  const author = document.querySelector('meta[name="author"]')?.content ||
    document.querySelector('[rel="author"]')?.textContent || "";
  const paragraphs = [...container.querySelectorAll("h1,h2,h3,p,blockquote,li,pre")];
  const text = paragraphs.map(node => node.innerText.trim()).filter(Boolean).join("\n\n");
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return {
    id: crypto.randomUUID(), title: title.trim(), url: location.href,
    domain: location.hostname, image, description, author: author.trim(),
    siteName: document.querySelector('meta[property="og:site_name"]')?.content || location.hostname,
    text, wordCount, readingMinutes: Math.max(1, Math.ceil(wordCount / 220)),
    savedAt: new Date().toISOString(), progress: 0, status: "unread"
  };
}

export function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
