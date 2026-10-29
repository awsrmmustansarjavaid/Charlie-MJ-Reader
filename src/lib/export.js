/** Browser-native exports; no server upload is required. */
export function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}
function htmlToMarkdown(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  const render = node => {
    if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, " ");
    if (node.nodeType !== 1) return "";
    const inner = [...node.childNodes].map(render).join("").trim();
    switch(node.tagName){
      case "H1": return `\n# ${inner}\n`;
      case "H2": return `\n## ${inner}\n`;
      case "H3": return `\n### ${inner}\n`;
      case "H4": return `\n#### ${inner}\n`;
      case "P": return `\n${inner}\n`;
      case "STRONG": case "B": return `**${inner}**`;
      case "EM": case "I": return `*${inner}*`;
      case "BLOCKQUOTE": return `\n> ${inner.replace(/\n/g,"\n> ")}\n`;
      case "LI": return `- ${inner}\n`;
      case "A": return node.getAttribute("href") ? `[${inner}](${node.getAttribute("href")})` : inner;
      case "BR": return "\n";
      case "IMG": return node.getAttribute("src") ? `\n![${node.getAttribute("alt")||""}](${node.getAttribute("src")})\n` : "";
      case "PRE": return `\n\`\`\`\n${node.textContent}\n\`\`\`\n`;
      default: return inner;
    }
  };
  return render(root).replace(/\n{3,}/g,"\n\n").trim();
}
export function exportArticle(article, format = "md") {
  const safeName = (article.title || "article").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 70);
  const source = `Source: ${article.url}\nAuthor: ${article.author || "Unknown"}\n\n`;
  if (format === "json") return downloadText(`${safeName}.json`, JSON.stringify(article, null, 2), "application/json");
  if (format === "txt") return downloadText(`${safeName}.txt`, `${article.title}\n\n${source}${article.text}`);
  if (format === "html") {
    const body = article.html || `<p>${String(article.text||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}</p>`;
    return downloadText(`${safeName}.html`, `<!doctype html><meta charset="utf-8"><title>${article.title}</title><article><h1>${article.title}</h1>${body}</article>`, "text/html");
  }
  return downloadText(`${safeName}.md`, `# ${article.title}\n\n${source}${htmlToMarkdown(article.html) || article.text}`);
}
export function exportBackup(data) {
  downloadText(`charlie-mj-reader-backup-${new Date().toISOString().slice(0,10)}.json`,
    JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), data }, null, 2),
    "application/json");
}
