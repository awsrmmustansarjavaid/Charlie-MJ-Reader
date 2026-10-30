/**
 * Charlie MJ Reader — website engine (v1.2.0)
 * Lightweight fetch + parse of websites, newspapers and author profiles.
 * No third-party libraries. Every network call has a timeout and a byte cap.
 * DOMParser is only used inside functions, so the module can be imported anywhere.
 */
import { getAll, saveAll } from "./storage.js";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */
export const CATEGORIES = ["Tech", "Health", "Science", "Business", "Lifestyle", "Education", "Sports", "Entertainment", "Social", "News", "General"];

export const NEWS_PRESETS = [
  { name: "BBC News", url: "https://www.bbc.com/news", country: "United Kingdom" },
  { name: "The Guardian", url: "https://www.theguardian.com", country: "United Kingdom" },
  { name: "The New York Times", url: "https://www.nytimes.com", country: "United States" },
  { name: "The Washington Post", url: "https://www.washingtonpost.com", country: "United States" },
  { name: "Reuters", url: "https://www.reuters.com", country: "Global" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com", country: "Qatar" },
  { name: "Dawn", url: "https://www.dawn.com", country: "Pakistan" },
  { name: "The Express Tribune", url: "https://tribune.com.pk", country: "Pakistan" },
  { name: "The Hindu", url: "https://www.thehindu.com", country: "India" },
  { name: "Le Monde", url: "https://www.lemonde.fr", country: "France" },
  { name: "Deutsche Welle", url: "https://www.dw.com", country: "Germany" },
  { name: "South China Morning Post", url: "https://www.scmp.com", country: "Hong Kong" },
  { name: "The Japan Times", url: "https://www.japantimes.co.jp", country: "Japan" },
  { name: "Hürriyet Daily News", url: "https://www.hurriyetdailynews.com", country: "Türkiye" }
];

const MIXED_PLATFORMS = new Set(["medium.com", "substack.com", "wordpress.com", "blogspot.com", "tumblr.com", "hashnode.dev", "ghost.io", "wixsite.com", "x.com", "twitter.com", "reddit.com", "quora.com"]);

/** Publishers whose topic is certain — skips guessing. */
const KNOWN = {
  "dev.to": "Tech", "hackernoon.com": "Tech", "freecodecamp.org": "Tech", "smashingmagazine.com": "Tech", "thehackernews.com": "Tech",
  "css-tricks.com": "Tech", "stackoverflow.blog": "Tech", "github.blog": "Tech", "techcrunch.com": "Tech", "theverge.com": "Tech", "wired.com": "Tech",
  "arstechnica.com": "Tech", "infoq.com": "Tech", "hashnode.com": "Tech",
  "quantamagazine.org": "Science", "nature.com": "Science", "sciencedaily.com": "Science", "newscientist.com": "Science",
  "mayoclinic.org": "Health", "clevelandclinic.org": "Health", "healthline.com": "Health", "nhs.uk": "Health", "harvard.edu": "Health",
  "verywellfit.com": "Health", "precisionnutrition.com": "Health", "aad.org": "Health", "dermnetnz.org": "Health", "practicaldermatology.com": "Health",
  "psychcentral.com": "Health", "apa.org": "Health", "mindful.org": "Health", "webmd.com": "Health", "who.int": "Health",
  "berkeley.edu": "Health", "byrdie.com": "Lifestyle", "allure.com": "Lifestyle", "theschooloflife.com": "Lifestyle",
  "eksisozluk.com": "Social", "x.com": "Social", "twitter.com": "Social"
};

const KEYWORDS = {
  Tech: ["software", "programming", "developer", "developers", "javascript", "typescript", "python", "rust", "golang", "api", "apis", "artificial intelligence", "machine learning", "deep learning", "llm", "chatgpt", "cloud", "aws", "kubernetes", "docker", "devops", "cybersecurity", "malware", "vulnerability", "ransomware", "github", "open source", "linux", "web development", "frontend", "backend", "css", "html", "react", "database", "sql", "algorithm", "coding", "gadgets", "smartphone", "hardware", "startup", "saas", "blockchain", "data science", "tech", "technology", "android", "ios", "browser"],
  Health: ["health", "medical", "medicine", "disease", "symptoms", "treatment", "doctor", "nutrition", "diet", "fitness", "wellness", "hospital", "therapy", "diabetes", "cancer", "vitamin", "exercise", "clinic", "skin", "dermatology", "acne", "mental health", "anxiety", "depression", "mindfulness", "sleep", "heart", "blood pressure", "patients", "diagnosis", "weight loss", "workout", "psychology"],
  Science: ["science", "physics", "chemistry", "biology", "astronomy", "space", "quantum", "mathematics", "research", "scientists", "universe", "genome", "climate", "neuroscience", "evolution", "particle"],
  Business: ["business", "finance", "investing", "stock", "market", "economy", "entrepreneur", "marketing", "revenue", "banking", "crypto", "management", "leadership", "sales", "ecommerce", "venture", "profit"],
  Lifestyle: ["lifestyle", "beauty", "makeup", "skincare", "fashion", "travel", "food", "recipe", "recipes", "home decor", "parenting", "relationships", "philosophy", "self improvement", "productivity", "habits", "culture"],
  Education: ["education", "learning", "students", "university", "school", "teaching", "course", "courses", "tutorial", "curriculum", "exam", "scholarship"],
  Sports: ["sports", "football", "soccer", "cricket", "basketball", "tennis", "olympics", "league", "match", "tournament"],
  Entertainment: ["movie", "movies", "film", "music", "celebrity", "tv series", "streaming", "gaming", "games", "anime", "box office", "album"]
};
const KEYWORD_RE = Object.fromEntries(Object.entries(KEYWORDS).map(([cat, words]) => [cat, words.map(w => ({ w, re: new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "g") }))]));

const SLD = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.in", "com.pk", "org.pk", "edu.pk", "gov.pk", "net.pk", "com.br", "co.jp", "co.nz", "com.cn", "com.tr", "co.za", "com.sg", "com.my", "com.ng", "com.eg", "com.sa", "com.bd", "com.np", "com.lk", "com.hk", "com.tw", "co.kr", "com.mx", "com.ar"]);
const TLD_COUNTRY = { pk: "Pakistan", uk: "United Kingdom", in: "India", us: "United States", au: "Australia", ca: "Canada", de: "Germany", fr: "France", jp: "Japan", cn: "China", tr: "Türkiye", ae: "United Arab Emirates", sa: "Saudi Arabia", bd: "Bangladesh", lk: "Sri Lanka", np: "Nepal", ng: "Nigeria", za: "South Africa", br: "Brazil", it: "Italy", es: "Spain", ru: "Russia", kr: "South Korea", id: "Indonesia", my: "Malaysia", sg: "Singapore", nz: "New Zealand", ie: "Ireland", nl: "Netherlands", se: "Sweden", no: "Norway", eg: "Egypt", qa: "Qatar", hk: "Hong Kong", mx: "Mexico", ar: "Argentina", ir: "Iran", af: "Afghanistan" };
const STOP = new Set("the a an and or but of to in on at for with from by is are was were be been it its this that these those as not no you your we our they their he she his her have has had will can could should would about into over than then so if more most also just what which who how why when where there here out up one two new all any some such may use used using get gets make makes made like very".split(" "));

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
export const stripWww = (h) => String(h || "").toLowerCase().replace(/^www\./, "");
export function parseUrlInput(input) {
  let v = String(input || "").trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = "https://" + v.replace(/^\/+/, "");
  try { const u = new URL(v); return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u : null; } catch { return null; }
}
export function registrable(host) {
  host = stripWww(host);
  const p = host.split(".");
  if (p.length <= 2) return host;
  return SLD.has(p.slice(-2).join(".")) ? p.slice(-3).join(".") : p.slice(-2).join(".");
}
export function countryFor(host) {
  return TLD_COUNTRY[String(host).split(".").pop()] || "Global";
}
export function languageLabel(code) {
  if (!code) return "";
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(String(code).split(/[_-]/)[0]) || code; } catch { return code; }
}
const abs = (href, base) => { try { return new URL(href, base).href; } catch { return ""; } };
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export async function fetchText(url, { timeout = 12000, maxBytes = 700000, accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5" } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: "follow", credentials: "omit", cache: "no-store", headers: { Accept: accept } });
    const reader = res.body?.getReader?.();
    let text = "";
    if (reader) {
      const dec = new TextDecoder("utf-8"); let bytes = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; text += dec.decode(value, { stream: true }); if (bytes >= maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } break; } }
    } else text = (await res.text()).slice(0, maxBytes);
    return { ok: res.ok, status: res.status, url: res.url || url, text, type: res.headers.get("content-type") || "" };
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "The website took too long to respond." : "Could not reach the website (blocked, offline or invalid address).");
  } finally { clearTimeout(timer); }
}

/* ------------------------------------------------------------------ */
/* HTML parsing                                                        */
/* ------------------------------------------------------------------ */
export function parseHtml(html, baseUrl) {
  // Pages can contain SVG/HTML event-handler attributes such as onclick/onload.
  // The extension page has a strict MV3 CSP, so never pass those handlers through
  // even while parsing third-party markup. Strip executable URL schemes and event
  // attributes before handing the response to DOMParser.
  const inertHtml = String(html || "")
    .replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, " ")
    .replace(/(?:href|src|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|\s*javascript:[^\s>]+)/gi, "")
    .replace(/<\s*(?:script|iframe|object|embed|foreignObject)\b[^>]*>.*?<\/\s*(?:script|iframe|object|embed|foreignObject)\s*>/gis, (tag) =>
      /application\/ld\+json/i.test(tag) && /^<\s*script/i.test(tag) ? tag : ""
    );
  const doc = new DOMParser().parseFromString(inertHtml, "text/html");
  // Defense in depth: remove any executable attributes that survived malformed markup.
  doc.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      if (/^on/i.test(attr.name) || /^(href|src|xlink:href)$/i.test(attr.name) && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    });
  });
  const meta = (sel) => clean(doc.querySelector(sel)?.getAttribute("content"));
  const base = new URL(baseUrl);
  const ld = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => { try { const j = JSON.parse(s.textContent); (Array.isArray(j) ? j : j["@graph"] || [j]).forEach((x) => x && ld.push(x)); } catch { /* ignore */ } });
  const ldTypes = [...new Set(ld.flatMap((x) => [].concat(x["@type"] || [])))].slice(0, 12);
  const ldLogo = (() => {
    for (const x of ld) {
      const cand = x.logo || x.publisher?.logo || x.image;
      const u = typeof cand === "string" ? cand : cand?.url;
      if (u && /Organization|NewsMedia|Publisher|WebSite|Blog|Person/i.test(JSON.stringify(x["@type"] || "") + "Organization")) return abs(u, baseUrl);
    }
    return "";
  })();
  const ldPerson = ld.find((x) => /Person/i.test(JSON.stringify(x["@type"] || "")));

  const icons = [...doc.querySelectorAll('link[rel~="icon"],link[rel~="apple-touch-icon"],link[rel~="apple-touch-icon-precomposed"],link[rel="shortcut icon"],link[rel~="mask-icon"]')]
    .map((l) => { const sz = parseInt((l.getAttribute("sizes") || "0").split("x")[0], 10) || 0; return { href: abs(l.getAttribute("href"), baseUrl), size: /apple-touch/.test(l.getAttribute("rel")) ? Math.max(sz, 180) : sz }; })
    .filter((i) => i.href).sort((a, b) => b.size - a.size).map((i) => i.href);

  const feeds = [...doc.querySelectorAll('link[rel="alternate"][type*="rss"],link[rel="alternate"][type*="atom"]')]
    .map((l) => ({ url: abs(l.getAttribute("href"), baseUrl), title: clean(l.getAttribute("title")) })).filter((f) => f.url);

  const socialRe = { x: /^(?:www\.)?(?:twitter|x)\.com\/(?!share|intent|home)[\w.]+/i, facebook: /^(?:www\.)?facebook\.com\/[\w.\-]+/i, linkedin: /^(?:www\.)?linkedin\.com\/(?:in|company)\/[\w\-%.]+/i, github: /^(?:www\.)?github\.com\/[\w\-]+\/?$/i, youtube: /^(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)[\w\-.]+/i, instagram: /^(?:www\.)?instagram\.com\/[\w.]+/i, medium: /^(?:www\.)?medium\.com\/@[\w.\-]+/i };
  const social = {};
  doc.querySelectorAll("a[href]").forEach((a) => {
    const href = abs(a.getAttribute("href"), baseUrl); if (!href) return;
    const bare = href.replace(/^https?:\/\//, "");
    for (const [k, re] of Object.entries(socialRe)) if (!social[k] && re.test(bare)) social[k] = href;
  });

  const imgs = [...doc.querySelectorAll("img")];
  const links = [...doc.querySelectorAll("a[href]")].map((a) => abs(a.getAttribute("href"), baseUrl)).filter(Boolean);
  const internal = links.filter((h) => { try { return stripWww(new URL(h).hostname) === stripWww(base.hostname); } catch { return false; } }).length;
  const main = doc.querySelector("article, main, [role=main]") || doc.body;
  const bodyText = clean(main?.textContent || "");
  const articleText = [...(main?.querySelectorAll("h1,h2,h3,p,blockquote,li,pre") || [])].map((n) => clean(n.textContent)).filter((t) => t.length > 1).join("\n\n");
  const navText = [...doc.querySelectorAll("nav a, header a")].slice(0, 60).map((a) => clean(a.textContent)).filter(Boolean).join(" ");
  const rawTitle = clean(doc.querySelector("title")?.textContent);
  const siteName = meta('meta[property="og:site_name"]') || meta('meta[name="application-name"]') || (ldPerson ? "" : clean(ld.find((x) => /WebSite|Organization|NewsMediaOrganization/i.test(JSON.stringify(x["@type"] || "")))?.name)) || "";

  return {
    pageTitle: meta('meta[property="og:title"]') || rawTitle,
    rawTitle,
    siteName: siteName || rawTitle.split(/\s[|\-–—·]\s/).pop() || base.hostname,
    description: meta('meta[property="og:description"]') || meta('meta[name="description"]') || meta('meta[name="twitter:description"]'),
    subtitle: meta('meta[property="og:description"]') || meta('meta[name="description"]') || meta('meta[name="twitter:description"]') || clean(doc.querySelector("article header h2, article .subtitle, article .dek, article .subheadline")?.textContent),
    metaDescription: meta('meta[name="description"]'),
    lang: clean(doc.documentElement.getAttribute("lang")), locale: meta('meta[property="og:locale"]'),
    keywords: meta('meta[name="keywords"]').split(",").map(clean).filter(Boolean).slice(0, 25),
    canonical: abs(doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || "", baseUrl),
    robots: meta('meta[name="robots"]'), themeColor: meta('meta[name="theme-color"]'),
    author: meta('meta[name="author"]') || clean(doc.querySelector('[rel="author"]')?.textContent) || clean(ldPerson?.name),
    publishedAt: meta('meta[property="article:published_time"]') || meta('meta[name="date"]') || meta('meta[itemprop="datePublished"]'),
    ogType: meta('meta[property="og:type"]'), ogImage: abs(meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]'), baseUrl),
    twitterCard: meta('meta[name="twitter:card"]'), twitterSite: meta('meta[name="twitter:site"]'),
    ldLogo, icons, feeds, social, ldTypes,
    h1: [...doc.querySelectorAll("h1")].map((h) => clean(h.textContent)).filter(Boolean).slice(0, 5),
    h2Count: doc.querySelectorAll("h2").length,
    imageCount: imgs.length, imagesMissingAlt: imgs.filter((i) => !(i.getAttribute("alt") || "").trim()).length,
    linkCount: links.length, internalLinks: internal, externalLinks: links.length - internal,
    hreflang: doc.querySelectorAll('link[rel="alternate"][hreflang]').length,
    hasViewport: !!doc.querySelector('meta[name="viewport"]'), hasOg: !!meta('meta[property="og:title"]') && !!meta('meta[property="og:image"]'),
    wordCount: bodyText.split(/\s+/).filter(Boolean).length, bodyText: bodyText.slice(0, 30000), articleText, navText
  };
}

/** Parses RSS 2.0 or Atom into a common shape. */
export function parseFeed(xml) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) return null;
  const txt = (el, tag) => clean(el.getElementsByTagName(tag)[0]?.textContent);
  const channel = doc.getElementsByTagName("channel")[0] || doc.getElementsByTagName("feed")[0];
  if (!channel) return null;
  const isAtom = channel.tagName.toLowerCase() === "feed";
  const nodes = [...doc.getElementsByTagName(isAtom ? "entry" : "item")].slice(0, 20);
  const link = isAtom ? (channel.querySelector('link[rel="alternate"],link:not([rel])')?.getAttribute("href") || "") : txt(channel, "link");
  const image = clean(channel.getElementsByTagName("image")[0]?.getElementsByTagName("url")[0]?.textContent) || clean(channel.getElementsByTagName("logo")[0]?.textContent) || clean(channel.getElementsByTagName("icon")[0]?.textContent);
  return {
    title: clean(channel.getElementsByTagName("title")[0]?.textContent), description: txt(channel, isAtom ? "subtitle" : "description"), link, image,
    items: nodes.map((n) => ({
      title: txt(n, "title"),
      link: isAtom ? (n.querySelector('link[rel="alternate"],link:not([rel])')?.getAttribute("href") || "") : (txt(n, "link") || txt(n, "guid")),
      date: txt(n, isAtom ? "updated" : "pubDate") || txt(n, "published") || txt(n, "dc:date"),
      author: txt(n, "dc:creator") || txt(n, "author") || txt(n, "name"),
      categories: [...n.getElementsByTagName("category")].map((c) => clean(c.textContent || c.getAttribute("term"))).filter(Boolean).slice(0, 8),
      summary: clean((txt(n, "description") || txt(n, "summary")).replace(/<[^>]+>/g, " ")).slice(0, 240)
    })).filter((i) => i.title)
  };
}

/* ------------------------------------------------------------------ */
/* Auto category                                                       */
/* ------------------------------------------------------------------ */
export function scoreText(text) {
  const t = " " + String(text || "").toLowerCase() + " ";
  const out = {};
  for (const [cat, list] of Object.entries(KEYWORD_RE)) {
    let s = 0;
    for (const { re } of list) { const m = t.match(re); if (m) s += Math.min(m.length, 3); }
    if (s) out[cat] = s;
  }
  return out;
}
const top2 = (scores) => { const e = Object.entries(scores).sort((a, b) => b[1] - a[1]); return { a: e[0], b: e[1] }; };

/**
 * Rule: a publisher whose recent articles are ~all one topic gets that topic;
 * a mixed publisher (like Medium) gets "General".
 */
export function classifySite({ domain = "", title = "", description = "", keywords = [], headings = [], navText = "", items = [], isNews = false }) {
  const host = stripWww(domain), reg = registrable(domain);
  if (isNews) return { category: "News", confidence: 1, reason: "Added as a newspaper / news website." };
  if (KNOWN[host] || KNOWN[reg]) return { category: KNOWN[host] || KNOWN[reg], confidence: 1, reason: "Recognised publisher." };
  if (MIXED_PLATFORMS.has(host)) return { category: "General", confidence: 0.9, reason: "Multi-topic publishing platform — articles span many topics." };

  if (items.length >= 4) {
    const counts = {};
    for (const it of items) {
      const s = scoreText(`${it.title} ${(it.categories || []).join(" ")} ${it.summary || ""}`);
      const { a, b } = top2(s);
      const winner = a && (!b || a[1] > b[1]) ? a[0] : "General";
      counts[winner] = (counts[winner] || 0) + 1;
    }
    const ranked = Object.entries(counts).sort((x, y) => y[1] - x[1]);
    const [cat, n] = ranked[0];
    const share = n / items.length;
    if (cat !== "General" && share >= 0.7) return { category: cat, confidence: +share.toFixed(2), reason: `${Math.round(share * 100)}% of the latest ${items.length} articles are ${cat}.` };
    const mix = ranked.slice(0, 3).map(([c, k]) => `${c} ${Math.round((k / items.length) * 100)}%`).join(", ");
    return { category: "General", confidence: +(1 - share).toFixed(2), reason: `Mixed topics (${mix}).` };
  }
  const s = scoreText(`${title} ${description} ${keywords.join(" ")} ${headings.join(" ")} ${navText}`);
  const { a, b } = top2(s);
  if (a && a[1] >= 6 && (!b || a[1] >= b[1] * 2)) return { category: a[0], confidence: 0.7, reason: `Site description and navigation are mostly about ${a[0]}.` };
  return { category: "General", confidence: 0.4, reason: "No single dominant topic detected." };
}

/* ------------------------------------------------------------------ */
/* SEO, ranking, Google audit                                          */
/* ------------------------------------------------------------------ */
export function topKeywords(text, n = 12) {
  const freq = {};
  String(text || "").toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).forEach((w) => { if (w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w)) freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([word, count]) => ({ word, count }));
}

/** On-page SEO audit computed from parsed HTML. */
export function seoAudit(p, finalUrl, { article = false } = {}) {
  const checks = [];
  const add = (id, label, status, detail) => checks.push({ id, label, status, detail });
  const tl = (p.rawTitle || "").length, dl = (p.metaDescription || "").length;
  add("https", "HTTPS", finalUrl.startsWith("https://") ? "pass" : "fail", finalUrl.startsWith("https://") ? "Served over a secure connection." : "Not served over HTTPS.");
  add("title", "Title tag", tl >= 25 && tl <= 65 ? "pass" : tl ? "warn" : "fail", tl ? `${tl} characters (ideal 25–65).` : "Missing <title>.");
  add("desc", "Meta description", dl >= 70 && dl <= 170 ? "pass" : dl ? "warn" : "fail", dl ? `${dl} characters (ideal 70–170).` : "Missing meta description.");
  add("h1", "Single H1", p.h1.length === 1 ? "pass" : p.h1.length ? "warn" : "fail", p.h1.length ? `${p.h1.length} H1 heading(s).` : "No H1 heading found.");
  add("canon", "Canonical URL", p.canonical ? "pass" : "warn", p.canonical || "No canonical link.");
  add("viewport", "Mobile viewport", p.hasViewport ? "pass" : "fail", p.hasViewport ? "Viewport meta present." : "Missing viewport meta.");
  add("lang", "Language attribute", p.lang ? "pass" : "warn", p.lang || "No lang attribute on <html>.");
  add("og", "Open Graph tags", p.hasOg ? "pass" : "warn", p.hasOg ? "og:title and og:image found." : "Missing og:title or og:image.");
  add("twitter", "Twitter/X card", p.twitterCard ? "pass" : "warn", p.twitterCard || "No twitter:card tag.");
  add("schema", "Structured data (JSON-LD)", p.ldTypes.length ? "pass" : "warn", p.ldTypes.length ? p.ldTypes.join(", ") : "No schema.org data.");
  add("robots", "Indexable", /noindex/i.test(p.robots) ? "fail" : "pass", p.robots ? `robots: ${p.robots}` : "No blocking robots meta.");
  const altPct = p.imageCount ? Math.round(((p.imageCount - p.imagesMissingAlt) / p.imageCount) * 100) : 100;
  add("alt", "Image alt text", altPct >= 90 ? "pass" : altPct >= 60 ? "warn" : "fail", `${altPct}% of ${p.imageCount} images have alt text.`);
  if (article) add("words", "Content length", p.wordCount >= 600 ? "pass" : p.wordCount >= 300 ? "warn" : "fail", `${p.wordCount} words.`);
  add("links", "Internal links", p.internalLinks >= 3 ? "pass" : "warn", `${p.internalLinks} internal / ${p.externalLinks} external links.`);
  const pts = checks.reduce((s, c) => s + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0);
  return { score: Math.round((pts / checks.length) * 100), checks, auditedAt: new Date().toISOString() };
}

export async function fetchTranco(domain) {
  const reg = registrable(domain);
  try {
    const r = await fetchText(`https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(reg)}`, { timeout: 8000, maxBytes: 60000, accept: "application/json" });
    if (!r.ok) throw new Error();
    const j = JSON.parse(r.text);
    const ranks = (j.ranks || []).filter((x) => x.rank);
    if (!ranks.length) return { domain: reg, rank: null, note: "Not in the Tranco top 1 million." };
    return { domain: reg, rank: ranks[0].rank, date: ranks[0].date, history: ranks.slice(0, 30).map((x) => ({ date: x.date, rank: x.rank })) };
  } catch { return { domain: reg, rank: null, note: "Ranking service unavailable right now." }; }
}

export async function fetchRobotsInfo(url) {
  try {
    const u = new URL(url);
    const r = await fetchText(`${u.origin}/robots.txt`, { timeout: 6000, maxBytes: 80000, accept: "text/plain" });
    if (!r.ok || /<html/i.test(r.text.slice(0, 300))) return { robots: false, sitemaps: [] };
    return { robots: true, sitemaps: [...r.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]).slice(0, 5), disallowAll: /^\s*disallow:\s*\/\s*$/im.test(r.text) };
  } catch { return { robots: null, sitemaps: [] }; }
}

/** Google's official Lighthouse/PageSpeed audit (includes Google's own SEO score). */
export async function runGoogleAudit(url, strategy = "mobile") {
  const cats = ["seo", "performance", "accessibility", "best-practices"].map((c) => `category=${c}`).join("&");
  const r = await fetchText(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&${cats}`, { timeout: 70000, maxBytes: 4000000, accept: "application/json" });
  let j; try { j = JSON.parse(r.text); } catch { throw new Error("Google returned an unreadable response."); }
  if (j.error) throw new Error(r.status === 429 ? "Google PageSpeed quota reached — try again in a few minutes." : j.error.message || "Google audit failed.");
  const lh = j.lighthouseResult; if (!lh) throw new Error("Google audit returned no data.");
  const pct = (k) => (lh.categories?.[k]?.score == null ? null : Math.round(lh.categories[k].score * 100));
  const failing = (lh.categories?.seo?.auditRefs || []).map((a) => lh.audits[a.id]).filter((a) => a && a.score !== null && a.score < 1 && a.scoreDisplayMode !== "notApplicable" && a.scoreDisplayMode !== "manual").map((a) => a.title).slice(0, 10);
  const vital = (id) => lh.audits?.[id]?.displayValue || "";
  return { strategy, seo: pct("seo"), performance: pct("performance"), accessibility: pct("accessibility"), bestPractices: pct("best-practices"), failingSeo: failing, lcp: vital("largest-contentful-paint"), cls: vital("cumulative-layout-shift"), tbt: vital("total-blocking-time"), fetchedAt: new Date().toISOString() };
}

export const googleLinks = (url, title = "") => {
  const u = new URL(url);
  return {
    site: `https://www.google.com/search?q=${encodeURIComponent("site:" + u.hostname)}`,
    page: `https://www.google.com/search?q=${encodeURIComponent("site:" + u.hostname + u.pathname)}`,
    title: title ? `https://www.google.com/search?q=${encodeURIComponent('"' + title + '"')}` : "",
    brand: `https://www.google.com/search?q=${encodeURIComponent(stripWww(u.hostname))}`
  };
};

/** Full SEO bundle for a single article/page URL. */
export async function seoForUrl(url) {
  const page = await fetchText(url);
  if (!page.ok) throw new Error(`The page returned HTTP ${page.status}.`);
  const p = parseHtml(page.text, page.url);
  const isArticle = new URL(page.url).pathname.length > 1;
  const [rank, robots] = await Promise.all([fetchTranco(new URL(page.url).hostname), fetchRobotsInfo(page.url)]);
  return { url: page.url, title: p.pageTitle, audit: seoAudit(p, page.url, { article: isArticle }), keywords: topKeywords(`${p.pageTitle} ${p.pageTitle} ${p.h1.join(" ")} ${p.articleText || p.bodyText}`), rank, robots, links: googleLinks(page.url, p.pageTitle), words: p.wordCount };
}

/* ------------------------------------------------------------------ */
/* Website / newspaper / profile bundle                                */
/* ------------------------------------------------------------------ */
const faviconFallbacks = (host) => [`https://www.google.com/s2/favicons?domain=${host}&sz=128`, `https://icons.duckduckgo.com/ip3/${host}.ico`];

async function loadFeed(candidates) {
  for (const url of candidates.filter(Boolean)) {
    try {
      const r = await fetchText(url, { timeout: 9000, maxBytes: 600000, accept: "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5" });
      if (!r.ok || !/<(rss|feed|rdf)/i.test(r.text.slice(0, 2000))) continue;
      const f = parseFeed(r.text);
      if (f?.items?.length) return { ...f, feedUrl: r.url };
    } catch { /* try next */ }
  }
  return null;
}

/** Fetch everything useful about a website in two light requests (page + feed) and one tiny ranking call. */
export async function fetchSiteBundle(input, { kind = "site", presetName = "", presetCountry = "" } = {}) {
  const u = parseUrlInput(input);
  if (!u) throw new Error("That does not look like a valid website address.");
  const origin = u.origin, host = u.hostname;
  const page = await fetchText(u.href);
  let p, finalUrl = page.url;
  if (page.ok) p = parseHtml(page.text, page.url);
  else if (page.status === 403 || page.status === 429) p = null; // bot protection — still keep favicon + feed data
  else throw new Error(`The website returned HTTP ${page.status}.`);
  const guess = ["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml"].map((x) => origin + x);
  const pageFeeds = (p?.feeds || []).map((f) => f.url);
  const feed = await loadFeed(pageFeeds.length ? pageFeeds : guess);
  const tranco = await fetchTranco(host);
  const logos = [...new Set([p?.ldLogo, ...(p?.icons || []), p?.ogImage && kind === "profile" ? p.ogImage : "", origin + "/favicon.ico", ...faviconFallbacks(host)].filter(Boolean))];
  const items = feed?.items || [];
  const cls = classifySite({ domain: host, title: p?.siteName || feed?.title || "", description: p?.description || feed?.description || "", keywords: p?.keywords || [], headings: p?.h1 || [], navText: p?.navText || "", items, isNews: kind === "news" });
  const name = presetName || (feed?.title && feed.title.length < 70 ? feed.title : "") || p?.siteName || host;
  const country = presetCountry || countryFor(host);
  return {
    domain: host, url: finalUrl, kind, title: clean(name), pageTitle: p?.pageTitle || "", description: p?.description || feed?.description || "",
    lang: p?.lang || "", language: languageLabel(p?.lang || p?.locale), country, keywords: p?.keywords || [], canonical: p?.canonical || "", themeColor: p?.themeColor || "",
    logo: logos[0] || "", logoFallbacks: logos.slice(1, 6), ogImage: p?.ogImage || "", feeds: [...new Set([...(p?.feeds || []).map((f) => f.url), feed?.feedUrl].filter(Boolean))].slice(0, 5),
    latest: items.slice(0, 12), social: p?.social || {}, author: p?.author || "", ldTypes: p?.ldTypes || [],
    seo: p ? seoAudit(p, finalUrl) : null, rank: tranco, category: cls.category, categoryConfidence: cls.confidence, categoryReason: cls.reason,
    blocked: !p, fetchedAt: new Date().toISOString()
  };
}

/* ---------- profiles ---------- */
export function detectProfile(urlLike) {
  const u = parseUrlInput(urlLike); if (!u) return null;
  const host = stripWww(u.hostname), path = u.pathname.replace(/\/+$/, "");
  let m;
  if ((host === "medium.com") && (m = path.match(/^\/@([\w.\-]+)/))) return { platform: "Medium", handle: m[1], feeds: [`https://medium.com/feed/@${m[1]}`], url: `https://medium.com/@${m[1]}` };
  if (host.endsWith(".medium.com") && host !== "medium.com") return { platform: "Medium", handle: host.split(".")[0], feeds: [`https://${host}/feed`], url: `https://${host}` };
  if (host === "dev.to" && (m = path.match(/^\/([\w.\-]+)$/)) && !["tags", "t", "search", "about"].includes(m[1])) return { platform: "DEV", handle: m[1], feeds: [`https://dev.to/feed/${m[1]}`], url: `https://dev.to/${m[1]}` };
  if (host === "substack.com" && (m = path.match(/^\/@([\w.\-]+)/))) return { platform: "Substack", handle: m[1], feeds: [], url: u.href };
  if (host.endsWith(".substack.com")) return { platform: "Substack", handle: host.split(".")[0], feeds: [`https://${host}/feed`], url: `https://${host}` };
  if (host === "hashnode.com" && (m = path.match(/^\/@([\w.\-]+)/))) return { platform: "Hashnode", handle: m[1], feeds: [`https://${m[1]}.hashnode.dev/rss.xml`], url: u.href };
  if (host === "github.com" && (m = path.match(/^\/([\w\-]+)$/))) return { platform: "GitHub", handle: m[1], feeds: [], url: u.href };
  if ((host === "x.com" || host === "twitter.com") && (m = path.match(/^\/(\w+)$/))) return { platform: "X", handle: m[1], feeds: [], url: u.href };
  if (/^\/(?:@|u\/|user\/|author\/|authors\/|people\/|profile\/|writers?\/|contributors?\/)/.test(path)) return { platform: host.split(".")[0], handle: path.split("/").filter(Boolean).pop().replace(/^@/, ""), feeds: [], url: u.href };
  return null;
}

export async function fetchProfileBundle(input) {
  const det = detectProfile(input);
  if (!det) throw new Error("That link is not recognised as a profile page. Try a link like medium.com/@name or dev.to/name.");
  const [pageR, feedR] = await Promise.allSettled([fetchText(det.url), loadFeed(det.feeds)]);
  const page = pageR.status === "fulfilled" && pageR.value.ok ? pageR.value : null;
  const feed = feedR.status === "fulfilled" ? feedR.value : null;
  if (!page && !feed) throw new Error("Could not read this profile (the site blocked the request). Try again later or add the website instead.");
  const p = page ? parseHtml(page.text, page.url) : null;
  const host = new URL(det.url).hostname;
  const avatar = (p?.ogImage && !/\/og\/|default/i.test(p.ogImage) ? p.ogImage : "") || feed?.image || "";
  const followers = (page?.text.match(/([\d.,]+\s?[KkMm]?)\s+Followers/) || [])[1] || "";
  const nameRaw = (p?.pageTitle || feed?.title || det.handle).replace(/\s[-–|·].*(Medium|DEV|Substack|Hashnode|GitHub).*$/i, "").replace(/\s*[-–|·]\s*(Medium|DEV Community|Substack|Hashnode)$/i, "").replace(/^Stories by\s+/i, "").replace(/\s+on Medium$/i, "");
  const items = feed?.items || [];
  const cls = classifySite({ domain: det.platform === "Medium" ? `${det.handle}.profile` : host, title: nameRaw, description: p?.description || feed?.description || "", items });
  return {
    id: `${det.platform}:${det.handle}`.toLowerCase(), platform: det.platform, handle: det.handle, url: det.url, domain: host,
    name: clean(nameRaw) || det.handle, bio: clean(p?.description || feed?.description || ""), avatar, avatarFallbacks: faviconFallbacks(host),
    followers, social: p?.social || {}, latest: items.slice(0, 10), feedUrl: feed?.feedUrl || "", category: cls.category === "News" ? "General" : cls.category,
    categoryReason: cls.reason, fetchedAt: new Date().toISOString(), blocked: !page
  };
}

/* ------------------------------------------------------------------ */
/* Library persistence                                                 */
/* ------------------------------------------------------------------ */
export function libraryOf(data) {
  data.readingLibrary ||= {};
  const l = data.readingLibrary;
  l.version = 3; l.categories ||= {}; l.websiteData ||= {}; l.favorites ||= []; l.profiles ||= []; l.seedVersion ||= 0;
  data.settings.websites ||= [];
  return l;
}
export const siteProfile = (raw) => (typeof raw === "string" ? { domain: raw } : raw || {});
export const findSite = (data, domain) => (data.settings.websites || []).map(siteProfile).find((s) => stripWww(s.domain) === stripWww(domain));
const newSite = (domain, extra = {}) => ({ domain, version: 1, enabled: true, toolbar: true, vocabulary: true, media: true, focus: true, productivity: true, autoTranslate: false, autoSave: false, nativeReading: true, position: "top", toolbarType: "floating", toolbarTheme: "midnight", category: "General", tags: [], type: "site", updatedAt: new Date().toISOString(), ...extra });

/** Merge a fetched bundle into the library (creates the website entry if it is new). */
export function applyBundle(data, b, { kind = "site" } = {}) {
  const lib = libraryOf(data);
  let site = findSite(data, b.domain);
  const isNew = !site;
  if (!site) { site = newSite(b.domain, { type: kind === "news" ? "news" : "site", category: b.category }); data.settings.websites.push(site); }
  if (kind === "news") site.type = "news";
  if (!site.categoryLocked && (isNew || site.category === "General" || site.autoCategory)) { site.category = kind === "news" ? "News" : b.category; site.autoCategory = true; }
  if (b.category && b.category !== "General") site.tags = [...new Set([...(site.tags || []), b.category.toLowerCase()])];
  site.updatedAt = new Date().toISOString();
  const prev = lib.websiteData[b.domain] || {};
  lib.websiteData[b.domain] = { ...prev, ...b, seeded: false, category: site.category, categoryReason: b.categoryReason, rank: b.rank?.rank != null || !prev.rank ? b.rank : prev.rank, seo: b.seo || prev.seo, google: prev.google, name: b.title };
  return { site, isNew };
}

export function applyProfile(data, pr) {
  const lib = libraryOf(data);
  const i = lib.profiles.findIndex((x) => x.id === pr.id);
  const merged = i >= 0 ? { ...lib.profiles[i], ...pr, category: lib.profiles[i].categoryLocked ? lib.profiles[i].category : pr.category } : pr;
  if (i >= 0) lib.profiles[i] = merged; else lib.profiles.unshift(merged);
  return { profile: merged, isNew: i < 0 };
}

export async function persistLibrary(data) {
  const fresh = await getAll();
  fresh.settings = { ...fresh.settings, websites: data.settings.websites };
  fresh.readingLibrary = data.readingLibrary; fresh.articles = data.articles;
  await saveAll(fresh);
  return fresh;
}

/** One call used by the Library page and the popup: add (or refresh) whatever the URL is. */
export async function addFromUrl(input, { kind = "auto", presetName = "", presetCountry = "" } = {}) {
  const u = parseUrlInput(input);
  if (!u) throw new Error("That does not look like a valid website address.");
  const data = await getAll(); libraryOf(data);
  let resolved = kind;
  if (kind === "auto") resolved = detectProfile(u.href) ? "profile" : "site";
  if (resolved === "profile") {
    const pr = await fetchProfileBundle(u.href);
    const r = applyProfile(data, pr);
    await persistLibrary(data);
    return { kind: "profile", label: pr.name, isNew: r.isNew, category: pr.category, id: pr.id };
  }
  const bundle = await fetchSiteBundle(u.href, { kind: resolved, presetName, presetCountry });
  const r = applyBundle(data, bundle, { kind: resolved });
  await persistLibrary(data);
  return { kind: resolved, label: bundle.title, isNew: r.isNew, category: r.site.category, domain: bundle.domain, reason: bundle.categoryReason, blocked: bundle.blocked };
}

/** Save an article by URL without needing a content script (used by the “Save” buttons). */
export async function saveArticleFromUrl(url, categoryHint = "") {
  const page = await fetchText(url);
  if (!page.ok) throw new Error(`The page returned HTTP ${page.status}.`);
  const p = parseHtml(page.text, page.url);
  if (!p.articleText || p.articleText.length < 200) throw new Error("No readable article text was found (the page may need a login or be paywalled).");
  const data = await getAll(); libraryOf(data);
  const host = new URL(page.url).hostname;
  const existing = data.articles.find((a) => a.url === page.url);
  const words = p.articleText.split(/\s+/).filter(Boolean).length;
  const settings = data.settings || {};
  let auto = classifySite({ domain: host, title: p.pageTitle, description: p.description, keywords: p.keywords, headings: p.h1, navText: p.navText });
  let category = categoryHint || findSite(data, host)?.category || (settings.intelligenceAutoCategoryArticles !== false && settings.libraryAutoCategory !== false ? auto.category : (settings.libraryDefaultArticleCategory || "General"));
  if (category === "General" && auto.category !== "General" && settings.intelligenceAutoCategoryArticles !== false) category = auto.category;
  const seo = settings.libraryFetchSeoOnSave !== false ? seoAudit(p, page.url, { article: true }) : null;
  const [rank, robots] = settings.libraryFetchCompleteArticle !== false ? await Promise.all([fetchTranco(host), fetchRobotsInfo(page.url)]) : [{ domain: registrable(host), rank: null, note: "Not fetched." }, { robots: null, sitemaps: [] }];
  const art = { id: existing?.id || crypto.randomUUID(), title: p.pageTitle, subtitle: p.subtitle || "", url: page.url, canonical: p.canonical || page.url, domain: host, image: p.ogImage, thumbnail: p.ogImage, description: p.description, author: p.author, siteName: p.siteName, publishedAt: p.publishedAt || "", text: p.articleText, html: p.articleText, sourceHtml: page.text, wordCount: words, readingMinutes: Math.max(1, Math.ceil(words / 220)), savedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), progress: existing?.progress || 0, status: existing?.status || "unread", category, categoryConfidence: categoryHint ? 1 : auto.confidence, categoryReason: categoryHint ? "Manually selected while saving." : auto.reason, categoryLocked: !!categoryHint, tags: settings.libraryAutoTags === false ? (existing?.tags || []) : [...new Set([...(existing?.tags || []), ...(p.keywords || []).slice(0, 8)])], labels: settings.libraryAutoLabels === false ? (existing?.labels || []) : [...new Set([...(existing?.labels || []), category, ...(p.keywords || []).slice(0, 4)])], seo, rank, robots, google: existing?.google || null, googleLinks: googleLinks(page.url, p.pageTitle) };
  if (existing) Object.assign(existing, art); else data.articles.unshift(art);
  const lib = libraryOf(data); lib.categories[art.category] = [art, ...(lib.categories[art.category] || []).filter((x) => x.url !== art.url)];
  if (settings.articleGoogleAuditOnSave !== false) { try { art.google = await runGoogleAudit(page.url, "mobile"); } catch (e) { art.googleError = e.message; } }
  await persistLibrary(data);
  return art;
}

/* ---------- bundled starter list ---------- */
export async function seedFromBundle() {
  const data = await getAll(); const lib = libraryOf(data);
  if (lib.seedVersion >= 3) return false;
  let seed = [];
  try { seed = await (await fetch(chrome.runtime.getURL("database/websites/charlie-mj-websites.json"))).json(); } catch { return false; }
  for (const item of seed) {
    const cur = findSite(data, item.domain);
    if (!cur) data.settings.websites.push({ ...newSite(item.domain), ...item, updatedAt: new Date().toISOString() });
    else if (!cur.categoryLocked && ["General", "Medium"].includes(cur.category) && item.category && item.category !== cur.category) { cur.category = item.category; cur.tags = [...new Set([...(cur.tags || []), ...(item.tags || [])])]; }
    lib.websiteData[item.domain] ||= { domain: item.domain, title: item.title || item.domain, category: item.category || "General", kind: item.type || "site", seeded: true };
  }
  lib.seedVersion = 3;
  await saveAll(data);
  return true;
}

/** Find the most recently used normal http(s) tab — the Library page itself is not a web page. */
export async function lastWebTab() {
  const tabs = await chrome.tabs.query({});
  const web = tabs.filter((t) => /^https?:\/\//i.test(t.url || "") && !t.url.startsWith("https://chromewebstore.google.com"));
  web.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return web[0] || null;
}
