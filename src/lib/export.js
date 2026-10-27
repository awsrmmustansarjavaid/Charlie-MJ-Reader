/** Browser-native exports; no server upload is required. */
export function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}
export function exportArticle(article, format = "md") {
  const safeName = (article.title || "article").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 70);
  const source = `Source: ${article.url}\nAuthor: ${article.author || "Unknown"}\n\n`;
  if (format === "json") return downloadText(`${safeName}.json`, JSON.stringify(article, null, 2), "application/json");
  if (format === "txt") return downloadText(`${safeName}.txt`, `${article.title}\n\n${source}${article.text}`);
  if (format === "html") {
    const escaped = article.text.replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
    return downloadText(`${safeName}.html`, `<!doctype html><meta charset="utf-8"><title>${article.title}</title><h1>${article.title}</h1><pre>${escaped}</pre>`, "text/html");
  }
  return downloadText(`${safeName}.md`, `# ${article.title}\n\n${source}${article.text}`);
}
export function exportBackup(data) {
  downloadText(`charlie-mj-reader-backup-${new Date().toISOString().slice(0,10)}.json`,
    JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), data }, null, 2),
    "application/json");
}
