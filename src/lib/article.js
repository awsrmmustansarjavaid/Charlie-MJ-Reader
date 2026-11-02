/** Extracts article-like content from the active page without bypassing access controls. */
export function extractCurrentPage() {
    const selectors = ["article", "main", '[role="main"]', ".post-content", ".article-content"];
    let container = null;
    for (const selector of selectors) {
        const candidate = document.querySelector(selector);
        if (candidate && candidate.innerText.trim().length > 250) {
            container = candidate;
            break;
        }
    }
    container ||= document.body;
    const title = document.querySelector('meta[property="og:title"]')?.content ||
        document.querySelector("h1")?.innerText || document.title;
    const image = document.querySelector('meta[property="og:image"]')?.content ||
        document.querySelector("article img, main img")?.src || "";
    const description = document.querySelector('meta[name="description"]')?.content ||
        document.querySelector('meta[property="og:description"]')?.content || "";
    // Publisher themes expose author information through several common metadata patterns.
    const author = document.querySelector('meta[name="author"]')?.content ||
        document.querySelector('[itemprop="author"] [itemprop="name"]')?.textContent ||
        document.querySelector('[itemprop="author"]')?.textContent ||
        document.querySelector('[rel="author"]')?.textContent ||
        document.querySelector('[class*="author"] [class*="name"], [class*="byline"] [class*="name"]')?.textContent || "";
    const authorImage = document.querySelector('meta[property="article:author_image"]')?.content ||
        document.querySelector('[itemprop="author"] img, [rel="author"] img, [class*="author"] img, [class*="byline"] img, [class*="profile"] img')?.src ||
        document.querySelector('img[alt*="author" i], img[alt*="profile" i]')?.src || "";
    const publishedAt = document.querySelector('meta[property="article:published_time"]')?.content ||
        document.querySelector('meta[name="date"]')?.content ||
        document.querySelector('time[datetime]')?.getAttribute("datetime") || "";
    const paragraphs = [...container.querySelectorAll("h1,h2,h3,p,blockquote,li,pre")];
    const text = paragraphs.map(node => node.innerText.trim()).filter(Boolean).join("\n\n");
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return {
        id: crypto.randomUUID(), title: title.trim(), url: location.href,
        domain: location.hostname, image, description, author: author.trim(),
        authorImage, publishedAt,
        siteName: document.querySelector('meta[property="og:site_name"]')?.content || location.hostname,
        subtitle: description,
        logo: document.querySelector('link[rel="icon"]')?.href || document.querySelector('link[rel="apple-touch-icon"]')?.href || "",
        language: document.documentElement.lang || "",
        text, wordCount, readingMinutes: Math.max(1, Math.ceil(wordCount / 220)),
        savedAt: new Date().toISOString(), progress: 0, status: "unread"
    };
}
export function safeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}
