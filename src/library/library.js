import { getAll } from "../lib/storage.js";
import {
  CATEGORIES, NEWS_PRESETS, libraryOf, siteProfile, findSite, stripWww, parseUrlInput, detectProfile, fetchSiteBundle, fetchProfileBundle,
  applyBundle, applyProfile, persistLibrary, seedFromBundle, lastWebTab, saveArticleFromUrl, seoForUrl, runGoogleAudit, googleLinks
} from "../lib/sites.js";

await seedFromBundle();
let data = await getAll();
libraryOf(data);
let currentView = "websites";
let catFilter = "All", countryFilter = "All";
const expanded = {};
let detail = null; // { type:'site'|'profile'|'article', key, tab, result, error }
let queue = Promise.resolve();

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lib = () => libraryOf(data);
const sites = () => (data.settings.websites || []).map(siteProfile);
const words = (a) => (a.text || "").split(/\s+/).filter(Boolean).length;
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
const ago = (iso) => { if (!iso) return "never"; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const setStatus = (msg, error = false) => { $("view-status").textContent = msg; $("view-status").style.color = error ? "#fca5a5" : "#a7f3d0"; };
const save = () => (queue = queue.then(() => persistLibrary(data)).catch((e) => setStatus(e.message, true)));
const hl = (text, q) => { if (!q) return esc(text); const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"); let out = "", last = 0; const s = String(text || ""); s.replace(re, (m, off) => { out += esc(s.slice(last, off)) + `<mark class="highlight">${esc(m)}</mark>`; last = off + m.length; return m; }); return out + esc(s.slice(last)); };
function download(name, value) { const b = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
const reloadArticles = async () => { const fresh = await getAll(); data.articles = fresh.articles; };

/* ---------- logos (official logo first, then favicon services, then a letter) ---------- */
function logoList(domain, meta = {}) {
  const host = stripWww(domain);
  return [...new Set([meta.logo, ...(meta.logoFallbacks || []), `https://www.google.com/s2/favicons?domain=${host}&sz=128`, `https://icons.duckduckgo.com/ip3/${host}.ico`].filter(Boolean))];
}
function logoImg(list, letter, cls = "") {
  if (!list.length) return `<span class="logo-wrap ${cls}"><b class="logo-letter show">${esc((letter || "?")[0].toUpperCase())}</b></span>`;
  const [first, ...rest] = list;
  return `<span class="logo-wrap ${cls}"><img class="logo" src="${esc(first)}" data-fb="${esc(JSON.stringify(rest))}" alt="" loading="lazy" referrerpolicy="no-referrer"><b class="logo-letter">${esc((letter || "?")[0].toUpperCase())}</b></span>`;
}
document.addEventListener("error", (e) => {
  const i = e.target; if (i.tagName !== "IMG" || !i.classList.contains("logo")) return;
  const fb = JSON.parse(i.dataset.fb || "[]"); const next = fb.shift();
  if (next) { i.dataset.fb = JSON.stringify(fb); i.src = next; } else { i.style.display = "none"; i.nextElementSibling?.classList.add("show"); }
}, true);

/* ---------- data helpers ---------- */
function allWebsites() {
  const l = lib(); const out = new Map();
  for (const s of sites()) out.set(stripWww(s.domain), { domain: s.domain, site: s });
  for (const d of Object.keys(l.websiteData)) if (!out.has(stripWww(d))) out.set(stripWww(d), { domain: d, site: siteProfile(findSite(data, d) || { domain: d }) });
  return [...out.values()].map((x) => ({ ...x, meta: l.websiteData[x.domain] || {}, articles: (data.articles || []).filter((a) => stripWww(a.domain) === stripWww(x.domain)) }));
}
const nameOf = (x) => x.meta.title || x.meta.name || x.domain;
const isNews = (x) => x.site.type === "news";
const categoryOf = (x) => x.site.category || x.meta.category || "General";

/* ---------- cards ---------- */
function badges(x) {
  const m = x.meta, s = x.site;
  return `<span class="badge cat">${esc(categoryOf(x))}${s.autoCategory && !s.categoryLocked ? " ⚡" : ""}</span>${isNews(x) ? `<span class="badge">${esc(m.country || "Global")}</span>` : ""}${m.rank?.rank ? `<span class="badge rank" title="Tranco popularity rank">Rank #${fmt(m.rank.rank)}</span>` : ""}${m.seo ? `<span class="badge seo s${m.seo.score >= 80 ? "g" : m.seo.score >= 55 ? "o" : "r"}" title="On-page SEO score">SEO ${m.seo.score}</span>` : ""}<span class="badge">${x.articles.length} saved</span>${s.enabled === false ? '<span class="badge off">Disabled</span>' : ""}`;
}
function siteCard(x, q) {
  const { domain, site, meta } = x;
  const fav = lib().favorites.includes(domain), open = !!expanded[domain];
  const tags = [...new Set(site.tags || [])].slice(0, 8);
  const blurb = meta.description || (meta.fetchError ? "Could not fetch details: " + meta.fetchError : meta.fetchedAt ? "No description published by this website." : "Fetching website data…");
  return `<article class="card site-card">
    <div class="site-head">${logoImg(logoList(domain, meta), nameOf(x))}<div class="site-id"><div class="site-title">${hl(nameOf(x), q)}</div><div class="site-url">${hl(domain, q)}</div></div><button class="btn star" data-act="fav" data-d="${esc(domain)}" title="Favorite">${fav ? "★" : "☆"}</button></div>
    <div class="badges">${badges(x)}</div>
    ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    <p class="meta clamp">${esc(blurb)}</p>
    <div class="site-actions"><button class="primary-sm" data-act="detail" data-d="${esc(domain)}">Details</button><button data-act="refresh" data-d="${esc(domain)}">Refresh</button><button data-act="expand" data-d="${esc(domain)}">${open ? "Hide settings" : "Settings"}</button><button data-act="open-site" data-d="${esc(domain)}">Open ↗</button><button data-act="dl-site" data-d="${esc(domain)}">Download</button><button data-act="rm-site" data-d="${esc(domain)}">Remove</button></div>
    ${open ? siteSettings(domain, site) : ""}</article>`;
}
function siteSettings(domain, s) {
  const bools = [["Enable website", "enabled"], ["Main toolbar", "toolbar"], ["Vocabulary toolbar", "vocabulary"], ["Media toolbar", "media"], ["Focus tools", "focus"], ["Productivity toolbar", "productivity"], ["Native reading", "nativeReading"], ["Auto translate", "autoTranslate"], ["Auto-save vocabulary", "autoSave"]];
  const sel = (key, vals) => `<select data-site-key="${key}" data-domain="${esc(domain)}">${vals.map((v) => `<option ${s[key] === v ? "selected" : ""}>${v}</option>`).join("")}</select>`;
  const row = (label, ctl, small = "") => `<div class="setting"><div><strong>${label}</strong>${small ? `<small>${small}</small>` : ""}</div>${ctl}</div>`;
  const cats = [...new Set([...CATEGORIES, s.category || "General"])];
  return `<div class="settings-panel"><h3>Settings · ${esc(domain)}</h3>${bools.map(([l, k]) => `<label class="setting"><div><strong>${l}</strong><small>Saved for this website</small></div><input type="checkbox" data-site-key="${k}" data-domain="${esc(domain)}" ${s[k] !== false ? "checked" : ""}></label>`).join("")}
    ${row("Toolbar type", sel("toolbarType", ["floating", "navbar", "sidebar", "right-sidebar", "bottom-navbar", "bubble"]))}${row("Toolbar theme", sel("toolbarTheme", ["midnight", "graphite", "paper", "ocean", "forest"]))}
    ${row("Media theme", sel("mediaTheme", ["midnight", "sunset", "ocean"]))}${row("Vocabulary theme", sel("vocabularyTheme", ["violet", "amber", "mint"]))}${row("Productivity theme", sel("productivityTheme", ["focus", "green", "orange"]))}${row("Position", sel("position", ["top", "bottom", "left", "right"]))}
    ${row("Category", `<select data-site-key="category" data-domain="${esc(domain)}">${cats.map((v) => `<option ${s.category === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>`, "Changing it locks the category (no more auto-detect).")}
    ${row("Tags", `<input data-site-key="tags" data-domain="${esc(domain)}" value="${esc((s.tags || []).join(", "))}">`, "Comma-separated")}</div>`;
}
function chipsFor(items, current, attr) {
  const counts = {}; items.forEach((c) => (counts[c] = (counts[c] || 0) + 1));
  return `<div class="chips"><button class="chip ${current === "All" ? "on" : ""}" data-${attr}="All">All <i>${items.length}</i></button>${Object.entries(counts).sort().map(([c, n]) => `<button class="chip ${current === c ? "on" : ""}" data-${attr}="${esc(c)}">${esc(c)} <i>${n}</i></button>`).join("")}</div>`;
}
const addBar = (id, placeholder, btn) => `<form class="addbar" data-form="${id}"><input name="url" autocomplete="off" placeholder="${placeholder}"><button class="primary-sm" type="submit">${btn}</button></form>`;

/* ---------- views ---------- */
function renderWebsites(q) {
  const base = allWebsites().filter((x) => !isNews(x));
  const items = base.filter((x) => (catFilter === "All" || categoryOf(x) === catFilter) && (!q || JSON.stringify([x.domain, x.meta.title, x.meta.description, x.site.tags, categoryOf(x)]).toLowerCase().includes(q))).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  $("library-view").innerHTML = `<div class="section-head"><h2>Websites &amp; Blogs</h2><span class="meta">${items.length} of ${base.length} website(s)</span></div>${addBar("site", "Paste a website or blog address (e.g. https://dev.to)…", "＋ Add website")}${chipsFor(base.map(categoryOf), catFilter, "cat")}<div class="grid">${items.map((x) => siteCard(x, q)).join("") || '<div class="empty">No matching websites. Use “Add current website” or paste an address above.</div>'}</div>`;
}
function renderNews(q) {
  const base = allWebsites().filter(isNews);
  const items = base.filter((x) => (countryFilter === "All" || (x.meta.country || "Global") === countryFilter) && (!q || JSON.stringify([x.domain, x.meta.title, x.meta.description, x.meta.country]).toLowerCase().includes(q))).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const have = new Set(base.map((x) => stripWww(x.domain)));
  const presets = NEWS_PRESETS.filter((p) => !have.has(stripWww(new URL(p.url).hostname)));
  $("library-view").innerHTML = `<div class="section-head"><h2>Newspapers &amp; News</h2><span class="meta">${items.length} of ${base.length} newspaper(s)</span></div>${addBar("news", "Paste any newspaper or news website address…", "＋ Add newspaper")}
    ${presets.length ? `<div class="presets"><span class="meta">Quick add:</span>${presets.map((p) => `<button class="hint" data-preset="${esc(p.url)}" data-name="${esc(p.name)}" data-country="${esc(p.country)}">${esc(p.name)}</button>`).join("")}</div>` : ""}
    ${base.length ? chipsFor(base.map((x) => x.meta.country || "Global"), countryFilter, "country") : ""}
    <div class="grid">${items.map((x) => siteCard(x, q)).join("") || '<div class="empty">No newspapers yet. Add your favourite newspaper websites from anywhere in the world — paste an address above or tap a quick-add name.</div>'}</div>`;
}
function profileCard(p, q) {
  return `<article class="card site-card"><div class="site-head">${logoImg([p.avatar, ...(p.avatarFallbacks || [])].filter(Boolean), p.name, "round")}<div class="site-id"><div class="site-title">${hl(p.name, q)}</div><div class="site-url">${esc(p.platform)} · @${esc(p.handle)}</div></div></div>
    <div class="badges"><span class="badge cat">${esc(p.category || "General")}</span>${p.followers ? `<span class="badge">${esc(p.followers)} followers</span>` : ""}<span class="badge">${(p.latest || []).length} recent posts</span></div>
    <p class="meta clamp">${esc(p.bio || "No bio published.")}</p>
    ${(p.latest || []).slice(0, 3).map((i) => `<a class="mini-link" href="${esc(i.link)}" target="_blank" rel="noopener">• ${esc(i.title)}</a>`).join("")}
    <div class="site-actions"><button class="primary-sm" data-act="detail-p" data-d="${esc(p.id)}">Details</button><button data-act="refresh-p" data-d="${esc(p.id)}">Refresh</button><button data-act="open-p" data-d="${esc(p.id)}">Open ↗</button><button data-act="rm-p" data-d="${esc(p.id)}">Remove</button></div></article>`;
}
function renderProfiles(q) {
  const list = lib().profiles.filter((p) => !q || JSON.stringify([p.name, p.handle, p.bio, p.platform, p.category]).toLowerCase().includes(q));
  $("library-view").innerHTML = `<div class="section-head"><h2>Profile Pages</h2><span class="meta">${list.length} of ${lib().profiles.length} profile(s) · Medium, DEV, Substack, Hashnode, GitHub and more</span></div>${addBar("profile", "Paste a profile link (e.g. https://medium.com/@username)…", "＋ Add profile")}<div class="grid">${list.map((p) => profileCard(p, q)).join("") || '<div class="empty">No profiles yet. Paste a writer’s profile link above, for example https://medium.com/@username.</div>'}</div>`;
}
function renderArticles(q, filter) {
  let list = [...(data.articles || [])];
  if (filter === "favorites") list = list.filter((a) => lib().favorites.includes(a.domain));
  if (filter === "recent") list.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
  if (q) list = list.filter((a) => JSON.stringify(a).toLowerCase().includes(q));
  $("library-view").innerHTML = `<div class="section-head"><h2>${filter === "favorites" ? "Favorite" : filter === "recent" ? "Recent" : "Saved"} Articles</h2><span class="meta">${list.length} record(s)</span></div>${list.map((a) => `<article class="article">${a.thumbnail ? `<img class="article-thumb" src="${esc(a.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<h3>${hl(a.title || a.domain, q)}</h3>${a.subtitle ? `<p class="meta">${hl(a.subtitle, q)}</p>` : ""}<div class="meta">${hl(a.domain || "", q)} · ${a.wordCount || words(a)} words · ${esc(a.category || findSite(data, a.domain)?.category || "General")}${a.rank?.rank ? ` · Rank #${fmt(a.rank.rank)}` : ""}${a.google?.seo != null ? ` · Google SEO ${a.google.seo}` : ""}</div><p>${hl((a.text || "").slice(0, 600), q)}</p><div class="site-actions"><button class="primary-sm" data-act="article-detail" data-d="${esc(a.id)}">Details</button><button data-act="read" data-d="${esc(a.id)}">Read</button><button data-act="seo-article" data-d="${esc(a.id)}">SEO</button><button data-act="dl-article" data-d="${esc(a.id)}">Download</button><button data-act="rm-article" data-d="${esc(a.id)}">Remove</button></div></article>`).join("") || '<div class="empty">No saved articles.</div>'}`;
}
function renderCategories(q) {
  const map = {};
  for (const x of allWebsites()) (map[categoryOf(x)] ||= { sites: [], articles: 0 }).sites.push(x);
  for (const p of lib().profiles) map[p.category || "General"] ||= { sites: [], articles: 0 };
  for (const [c, items] of Object.entries(lib().categories)) (map[c] ||= { sites: [], articles: 0 }).articles = items.length;
  const entries = Object.entries(map).filter(([c, v]) => !q || (c + v.sites.map((s) => s.domain).join(" ")).toLowerCase().includes(q)).sort((a, b) => b[1].sites.length - a[1].sites.length);
  $("library-view").innerHTML = `<div class="section-head"><h2>Categories</h2><span class="meta">Categories are detected automatically from what each site publishes.</span></div><div class="grid">${entries.map(([c, v]) => `<article class="card"><h3>${hl(c, q)}</h3><div class="meta">${v.sites.length} website(s) · ${v.articles} saved article(s)</div><div class="logo-row">${v.sites.slice(0, 8).map((s) => logoImg(logoList(s.domain, s.meta), nameOf(s), "sm")).join("")}</div><div class="site-actions"><button data-act="open-cat" data-d="${esc(c)}">Open</button><button data-act="dl-cat" data-d="${esc(c)}">Download JSON</button></div></article>`).join("") || '<div class="empty">No categories yet.</div>'}</div>`;
}
function renderTags(q) {
  const tags = {};
  for (const s of sites()) for (const t of s.tags || []) tags[t] = (tags[t] || 0) + 1;
  for (const a of data.articles || []) for (const t of [...(a.tags || []), ...(a.labels || [])]) tags[t] = (tags[t] || 0) + 1;
  const entries = Object.entries(tags).filter(([t]) => !q || t.toLowerCase().includes(q)).sort((a, b) => b[1] - a[1]);
  $("library-view").innerHTML = `<div class="section-head"><h2>Tags &amp; Labels</h2></div><div class="grid">${entries.map(([t, n]) => `<article class="card"><h3>${hl(t, q)}</h3><div class="meta">${n} record(s)</div><button data-act="tag" data-d="${esc(t)}">Search tag</button></article>`).join("") || '<div class="empty">No tags yet.</div>'}</div>`;
}
function render() {
  const q = $("search").value.trim().toLowerCase();
  document.querySelectorAll("#side-nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === currentView));
  ({ websites: () => renderWebsites(q), news: () => renderNews(q), profiles: () => renderProfiles(q), favorites: () => renderArticles(q, "favorites"), saved: () => renderArticles(q, "all"), recent: () => renderArticles(q, "recent"), all: () => renderArticles(q, "all"), categories: () => renderCategories(q), tags: () => renderTags(q) }[currentView] || (() => {}))();
  $("hints").innerHTML = q ? [...new Set([...allWebsites().map((x) => x.domain), ...allWebsites().map(categoryOf)].filter((x) => x.toLowerCase().includes(q)))].slice(0, 8).map((x) => `<span class="hint" data-hint="${esc(x)}">${esc(x)}</span>`).join("") : "";
}
let renderTimer;
const renderSoon = () => { clearTimeout(renderTimer); renderTimer = setTimeout(() => { render(); if (detail && detail.type !== "article" && $("detail").open && !busyDetail) renderDetail(); }, 150); };
let busyDetail = false;

/* ---------- SEO / detail rendering ---------- */
const ring = (score, label) => `<div class="ring-box"><div class="ring ${score == null ? "na" : score >= 80 ? "g" : score >= 55 ? "o" : "r"}" style="--p:${score ?? 0}"><b>${score ?? "—"}</b></div><small>${esc(label)}</small></div>`;
function seoBlock(res, title = "On-page SEO") {
  const a = res.audit; if (!a) return '<div class="empty">No audit data yet.</div>';
  const icon = { pass: "✓", warn: "!", fail: "✕" };
  return `<div class="seo-top">${ring(a.score, title)}<ul class="checks">${a.checks.map((c) => `<li class="${c.status}"><i>${icon[c.status]}</i><div><strong>${esc(c.label)}</strong><small>${esc(c.detail)}</small></div></li>`).join("")}</ul></div>`;
}
function rankBlock(r) {
  if (!r) return "";
  if (!r.rank) return `<div class="note">Domain popularity (Tranco): ${esc(r.note || "not ranked")}</div>`;
  const hist = (r.history || []).slice().reverse(); const max = Math.max(...hist.map((h) => h.rank)), min = Math.min(...hist.map((h) => h.rank));
  return `<div class="rank-box"><div><small>Domain popularity rank (Tranco · lower is better)</small><div class="rank-num">#${fmt(r.rank)}</div><small>${esc(r.domain)} · ${esc(r.date || "")}</small></div><div class="spark" title="Last ${hist.length} days">${hist.map((h) => `<span style="height:${max === min ? 50 : 15 + ((max - h.rank) / (max - min)) * 85}%" title="${esc(h.date)}: #${fmt(h.rank)}"></span>`).join("")}</div></div>`;
}
function googleBlock(g) {
  if (!g) return '<div class="note">No Google audit yet. Run one below.</div>';
  return `<div class="g-scores">${ring(g.seo, "Google SEO")}${ring(g.performance, "Performance")}${ring(g.accessibility, "Accessibility")}${ring(g.bestPractices, "Best practices")}</div><div class="note">${esc(g.strategy)} test · ${esc(ago(g.fetchedAt))}${g.lcp ? ` · LCP ${esc(g.lcp)} · CLS ${esc(g.cls)} · TBT ${esc(g.tbt)}` : ""}</div>${g.failingSeo?.length ? `<div class="note"><strong>Google flags:</strong> ${g.failingSeo.map(esc).join(" · ")}</div>` : ""}`;
}
const linkBtns = (l) => `<div class="site-actions">${Object.entries({ "Google: site:domain": l.site, "Google: this page": l.page, "Google: exact title": l.title, "Google: brand": l.brand }).filter(([, v]) => v).map(([k, v]) => `<a class="linkbtn" href="${esc(v)}" target="_blank" rel="noopener">${k} ↗</a>`).join("")}</div>`;
const HONEST = '<div class="note small">Google does not publish keyword positions for free. This tab shows Google’s own PageSpeed/Lighthouse SEO score, an on-page audit and a public domain-popularity rank. Use the Google buttons to see where a page appears.</div>';
function articleSeoHtml(r) {
  return `<div class="art-seo"><h4>${esc(r.title || r.url)}</h4>${rankBlock(r.rank)}${seoBlock(r, "Page SEO")}<h4>Top keywords on this page</h4><div class="tags">${(r.keywords || []).map((k) => `<span class="tag">${esc(k.word)} · ${k.count}</span>`).join("")}</div><div class="note small">${r.words} words · robots.txt ${r.robots?.robots ? "found" : "not found"}${r.robots?.sitemaps?.length ? ` · ${r.robots.sitemaps.length} sitemap(s)` : " · no sitemap listed"}</div>${linkBtns(r.links)}${r.google ? googleBlock(r.google) : ""}<div class="site-actions"><button data-act="google-url" data-u="${esc(r.url)}" data-s="mobile">Run Google audit for this page</button></div>${HONEST}</div>`;
}
const rawBlock = (obj) => `<div class="site-actions"><button data-act="copy-raw">Copy JSON</button><button data-act="dl-raw">Download JSON</button></div><pre class="raw" id="raw-json">${esc(JSON.stringify(obj, null, 2))}</pre>`;

function renderDetail() {
  const d = detail; if (!d) return;
  let head = "", tabs = [], content = "";
  if (d.type === "site") {
    const x = allWebsites().find((s) => s.domain === d.key); if (!x) { $("detail").close(); return; }
    const m = x.meta, s = x.site, pages = Object.values(lib().seoPages || {});
    head = `${logoImg(logoList(x.domain, m), nameOf(x), "lg")}<div><h2>${esc(nameOf(x))}</h2><a class="site-url" href="https://${esc(x.domain)}" target="_blank" rel="noopener">${esc(x.domain)} ↗</a><div class="badges">${badges(x)}</div></div>`;
    tabs = [["overview", "Overview"], ["latest", `Latest articles (${(m.latest || []).length})`], ["seo", "SEO & Ranking"], ["saved", `Saved (${x.articles.length})`], ["raw", "Raw data"]];
    if (d.tab === "overview") content = `<div class="kv"><div><small>Category</small><select data-act-change="cat" data-d="${esc(x.domain)}">${[...new Set([...CATEGORIES, categoryOf(x)])].map((c) => `<option ${c === categoryOf(x) ? "selected" : ""}>${esc(c)}</option>`).join("")}</select><small>${esc(m.categoryReason || "")}${s.categoryLocked ? " (manually set)" : ""}</small></div><div><small>Country</small><input data-act-change="country" data-d="${esc(x.domain)}" value="${esc(m.country || "Global")}"></div><div><small>Language</small><b>${esc(m.language || m.lang || "—")}</b></div><div><small>Last fetched</small><b>${esc(ago(m.fetchedAt))}</b></div></div>
      <p class="lead">${esc(m.description || "No description published.")}</p>
      ${m.fetchError ? `<div class="note err">Last fetch failed: ${esc(m.fetchError)}</div>` : ""}${m.blocked ? '<div class="note">This website blocks automated page access, so only the logo, feed and ranking were collected.</div>' : ""}
      ${(m.keywords || []).length ? `<h4>Keywords</h4><div class="tags">${m.keywords.map((k) => `<span class="tag">${esc(k)}</span>`).join("")}</div>` : ""}
      <h4>Feeds</h4>${(m.feeds || []).length ? m.feeds.map((f) => `<a class="mini-link" href="${esc(f)}" target="_blank" rel="noopener">${esc(f)}</a>`).join("") : '<div class="meta">No RSS/Atom feed found.</div>'}
      <h4>Social &amp; profiles</h4>${Object.keys(m.social || {}).length ? `<div class="site-actions">${Object.entries(m.social).map(([k, v]) => `<a class="linkbtn" href="${esc(v)}" target="_blank" rel="noopener">${esc(k)} ↗</a>`).join("")}</div>` : '<div class="meta">None found on the home page.</div>'}
      <h4>Details</h4><table class="kvt"><tr><td>Canonical</td><td>${esc(m.canonical || "—")}</td></tr><tr><td>Theme colour</td><td>${m.themeColor ? `<span class="swatch" style="background:${esc(m.themeColor)}"></span>` : ""}${esc(m.themeColor || "—")}</td></tr><tr><td>Schema types</td><td>${esc((m.ldTypes || []).join(", ") || "—")}</td></tr><tr><td>Toolbar</td><td>${esc(s.toolbarType || "floating")} · ${esc(s.toolbarTheme || "midnight")} · ${s.enabled === false ? "disabled" : "enabled"}</td></tr><tr><td>Tags</td><td>${esc((s.tags || []).join(", ") || "—")}</td></tr></table>`;
    if (d.tab === "latest") content = (m.latest || []).length ? `<div class="list">${m.latest.map((i, n) => `<div class="li"><div><a href="${esc(i.link)}" target="_blank" rel="noopener"><strong>${esc(i.title)}</strong></a><small>${esc([i.author, i.date].filter(Boolean).join(" · "))}</small>${i.summary ? `<p class="meta">${esc(i.summary)}</p>` : ""}</div><div class="site-actions"><button data-act="save-item" data-d="${esc(x.domain)}" data-n="${n}">Save</button><button data-act="seo-item" data-d="${esc(x.domain)}" data-n="${n}">SEO</button></div></div>`).join("")}</div>` : '<div class="empty">No recent articles were found (no RSS/Atom feed, or the site blocks access).</div>';
    if (d.tab === "seo") {
      const options = [...(m.latest || []).map((i) => [i.link, i.title]), ...x.articles.map((a) => [a.url, a.title])].filter(([u]) => u);
      const last = pages.find((r) => { try { return stripWww(new URL(r.url).hostname) === stripWww(x.domain); } catch { return false; } });
      content = `${rankBlock(m.rank)}<h4>On-page SEO (home page)</h4>${m.seo ? seoBlock({ audit: m.seo }) : '<div class="note">No audit yet. Press Refresh.</div>'}<h4>Google PageSpeed / Lighthouse</h4>${googleBlock((m.google || {}).mobile || (m.google || {}).desktop)}<div class="site-actions"><button data-act="google" data-d="${esc(x.domain)}" data-s="mobile">Run Google audit (mobile)</button><button data-act="google" data-d="${esc(x.domain)}" data-s="desktop">Run Google audit (desktop)</button></div><h4>Check on Google</h4>${linkBtns(googleLinks(m.url || `https://${x.domain}`, m.title))}${HONEST}<h4>Audit a single article</h4><div class="site-actions"><select id="seo-pick">${options.map(([u, t]) => `<option value="${esc(u)}">${esc((t || u).slice(0, 80))}</option>`).join("") || "<option value=''>No articles available</option>"}</select><button data-act="seo-pick-run">Audit article</button></div><div id="seo-article">${last ? articleSeoHtml(last) : ""}</div>`;
    }
    if (d.tab === "saved") content = x.articles.length ? `<div class="list">${x.articles.map((a) => `<div class="li"><div><strong>${esc(a.title)}</strong><small>${a.wordCount || words(a)} words · ${esc(ago(a.savedAt))}</small></div><div class="site-actions"><button data-act="read" data-d="${esc(a.id)}">Read</button><button data-act="seo-article" data-d="${esc(a.id)}">SEO</button></div></div>`).join("")}</div>` : '<div class="empty">No saved articles from this website yet.</div>';
    if (d.tab === "raw") content = rawBlock({ settings: s, data: m });
  } else if (d.type === "profile") {
    const p = lib().profiles.find((x) => x.id === d.key); if (!p) { $("detail").close(); return; }
    head = `${logoImg([p.avatar, ...(p.avatarFallbacks || [])].filter(Boolean), p.name, "lg round")}<div><h2>${esc(p.name)}</h2><a class="site-url" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.platform)} · @${esc(p.handle)} ↗</a><div class="badges"><span class="badge cat">${esc(p.category || "General")}</span>${p.followers ? `<span class="badge">${esc(p.followers)} followers</span>` : ""}</div></div>`;
    tabs = [["overview", "Overview"], ["latest", `Posts (${(p.latest || []).length})`], ["raw", "Raw data"]];
    if (d.tab === "overview") content = `<p class="lead">${esc(p.bio || "No bio published.")}</p><table class="kvt"><tr><td>Platform</td><td>${esc(p.platform)}</td></tr><tr><td>Handle</td><td>@${esc(p.handle)}</td></tr><tr><td>Category</td><td>${esc(p.category)} — ${esc(p.categoryReason || "")}</td></tr><tr><td>Followers</td><td>${esc(p.followers || "not available")}</td></tr><tr><td>Feed</td><td>${esc(p.feedUrl || "—")}</td></tr><tr><td>Last fetched</td><td>${esc(ago(p.fetchedAt))}</td></tr></table>${p.blocked ? '<div class="note">The profile page blocked direct access; data comes from the public feed.</div>' : ""}${Object.keys(p.social || {}).length ? `<h4>Links</h4><div class="site-actions">${Object.entries(p.social).map(([k, v]) => `<a class="linkbtn" href="${esc(v)}" target="_blank" rel="noopener">${esc(k)} ↗</a>`).join("")}</div>` : ""}`;
    if (d.tab === "latest") content = (p.latest || []).length ? `<div class="list">${p.latest.map((i, n) => `<div class="li"><div><a href="${esc(i.link)}" target="_blank" rel="noopener"><strong>${esc(i.title)}</strong></a><small>${esc(i.date || "")}</small>${i.summary ? `<p class="meta">${esc(i.summary)}</p>` : ""}</div><div class="site-actions"><button data-act="save-pitem" data-d="${esc(p.id)}" data-n="${n}">Save</button><button data-act="seo-pitem" data-d="${esc(p.id)}" data-n="${n}">SEO</button></div></div>`).join("")}</div>` : '<div class="empty">No public posts were found for this profile.</div>';
    if (d.tab === "raw") content = rawBlock(p);
  } else if (d.type === "savedArticle") {
    const a = (data.articles || []).find((x) => x.id === d.key); if (!a) { $("detail").close(); return; }
    head = `${a.thumbnail ? `<img class="logo lg" src="${esc(a.thumbnail)}" alt="" referrerpolicy="no-referrer">` : ""}<div><h2>${esc(a.title || "Saved article")}</h2><a class="site-url" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url)} ↗</a></div>`;
    tabs = [["overview", "Details"], ["seo", "SEO & Google"], ["raw", "Raw data"]];
    if (d.tab === "overview") content = `<div class="kv"><div><small>Category</small><select data-article-cat="${esc(a.id)}">${[...new Set([...(data.settings.libraryCustomCategories || CATEGORIES), a.category || "General"])].map((c) => `<option ${c === (a.category || "General") ? "selected" : ""}>${esc(c)}</option>`).join("")}</select><small>${esc(a.categoryReason || "")}</small></div><div><small>Author</small><b>${esc(a.author || "—")}</b></div><div><small>Published</small><b>${esc(a.publishedAt || "—")}</b></div><div><small>Saved</small><b>${esc(ago(a.savedAt))}</b></div></div><h4>${esc(a.subtitle || "Subtitle not available")}</h4>${a.thumbnail ? `<img class="article-hero" src="${esc(a.thumbnail)}" alt="" referrerpolicy="no-referrer">` : ""}<p class="lead">${esc(a.description || "No description available.")}</p><table class="kvt"><tr><td>Canonical</td><td>${esc(a.canonical || "—")}</td></tr><tr><td>Site</td><td>${esc(a.siteName || a.domain || "—")}</td></tr><tr><td>Words</td><td>${fmt(a.wordCount || words(a))}</td></tr><tr><td>Reading time</td><td>${esc(a.readingMinutes || "—")} min</td></tr><tr><td>Domain rank</td><td>${a.rank?.rank ? `#${fmt(a.rank.rank)}` : esc(a.rank?.note || "—")}</td></tr><tr><td>Tags</td><td>${esc((a.tags || []).join(", ") || "—")}</td></tr><tr><td>Labels</td><td>${esc((a.labels || []).join(", ") || "—")}</td></tr></table>`;
    if (d.tab === "seo") content = `${a.seo ? seoBlock({audit:a.seo}, "Page SEO") : '<div class="note">No on-page SEO audit stored.</div>'}<h4>Google PageSpeed / Lighthouse</h4>${googleBlock(a.google)}${a.googleError ? `<div class="note err">${esc(a.googleError)}</div>` : ""}<h4>Google checks</h4>${linkBtns(a.googleLinks || googleLinks(a.url, a.title))}${HONEST}<div class="site-actions"><button data-act="google-saved" data-d="${esc(a.id)}" data-s="mobile">Refresh Google SEO</button></div>`;
    if (d.tab === "raw") content = rawBlock(a);
  } else if (d.type === "article") {
    head = `<div><h2>Article SEO</h2><a class="site-url" href="${esc(d.key)}" target="_blank" rel="noopener">${esc(d.key)} ↗</a></div>`;
    content = `<div id="seo-article">${d.result ? articleSeoHtml(d.result) : d.error ? `<div class="note err">${esc(d.error)}</div>` : '<div class="note">Auditing the page… this takes a few seconds.</div>'}</div>`;
  }
  $("detail-head").innerHTML = head;
  $("detail-tabs").innerHTML = tabs.map(([k, l]) => `<button class="${d.tab === k ? "on" : ""}" data-dtab="${k}">${l}</button>`).join("");
  $("detail-body").innerHTML = content;
}
function openDetail(type, key, tab = "overview") { detail = { type, key, tab }; renderDetail(); if (!$("detail").open) $("detail").showModal(); }
async function auditUrl(url) {
  const box = () => $("seo-article");
  if (box()) box().innerHTML = '<div class="note">Auditing the page… this takes a few seconds.</div>';
  try {
    const r = await seoForUrl(url); (lib().seoPages ||= {})[r.url] = r;
    const keys = Object.keys(lib().seoPages); if (keys.length > 40) delete lib().seoPages[keys[0]];
    if (detail?.type === "article") { detail.result = r; detail.error = ""; }
    await save(); if (box()) box().innerHTML = articleSeoHtml(r);
  } catch (e) { if (detail?.type === "article") detail.error = e.message; if (box()) box().innerHTML = `<div class="note err">${esc(e.message)}</div>`; }
}
function openArticleSeo(url) { detail = { type: "article", key: url }; renderDetail(); if (!$("detail").open) $("detail").showModal(); auditUrl(url); }

/* ---------- fetching ---------- */
async function refreshDomain(domain, { quiet = false } = {}) {
  const site = findSite(data, domain); const kind = site?.type === "news" ? "news" : "site";
  const prev = lib().websiteData[domain] || {};
  try {
    const b = await fetchSiteBundle(`https://${domain}`, { kind, presetName: prev.presetName || "", presetCountry: prev.presetCountry || (prev.countryLocked ? prev.country : "") });
    b.domain = domain;
    applyBundle(data, b, { kind });
    delete lib().websiteData[domain].fetchError;
    if (!quiet) setStatus(`Updated ${b.title} → ${categoryOf({ site: findSite(data, domain), meta: b })}. ${b.categoryReason}`);
  } catch (e) {
    lib().websiteData[domain] = { ...prev, domain, fetchedAt: new Date().toISOString(), fetchError: e.message };
    if (!quiet) setStatus(`${domain}: ${e.message}`, true);
  }
  await save(); renderSoon();
}
async function pool(domains, size, label) {
  let done = 0; const list = [...domains];
  const worker = async () => { while (list.length) { const d = list.shift(); await refreshDomain(d, { quiet: true }); setStatus(`${label} ${++done}/${domains.length}…`); } };
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, worker));
  setStatus(`${label} finished — ${domains.length} website(s) updated.`);
}
async function addSite(url, kind, preset = {}) {
  const u = parseUrlInput(url); if (!u) throw new Error("That does not look like a valid website address.");
  const resolved = kind === "auto" ? (detectProfile(u.href) ? "profile" : "site") : kind;
  setStatus(`Fetching ${u.hostname}…`);
  if (resolved === "profile") {
    const pr = await fetchProfileBundle(u.href); const r = applyProfile(data, pr); await save(); currentView = "profiles"; render();
    setStatus(`${r.isNew ? "Added" : "Updated"} profile ${pr.name} (${pr.platform}) · ${pr.category}.`); return;
  }
  const b = await fetchSiteBundle(u.href, { kind: resolved, presetName: preset.name, presetCountry: preset.country });
  const r = applyBundle(data, b, { kind: resolved });
  if (preset.name) lib().websiteData[b.domain].presetName = preset.name;
  if (preset.country) lib().websiteData[b.domain].presetCountry = preset.country;
  await save();
  currentView = resolved === "news" ? "news" : "websites"; catFilter = "All"; countryFilter = "All"; render();
  setStatus(`${r.isNew ? "Added" : "Updated"} ${b.title} → ${r.site.category}. ${b.categoryReason}${b.blocked ? " (The website blocks full page access, so only basic data was found.)" : ""}`);
}
async function addCurrentTab() {
  const tab = await lastWebTab();
  if (!tab) { openAddDialog("No open web page was found in your other tabs. Paste the website address instead."); return; }
  const kind = currentView === "news" ? "news" : currentView === "profiles" ? "profile" : "auto";
  await addSite(tab.url, kind);
  const u = new URL(tab.url); // also keep the article itself when the tab is an article page
  if (u.pathname.length > 1 && !detectProfile(tab.url) && kind === "auto") {
    try {
      let art = null;
      try { const r = await chrome.tabs.sendMessage(tab.id, { type: "CMJ_GET_PAGE_DATA" }); if (r?.ok) art = r.article; } catch { /* no content script on this tab */ }
      if (art) { if (!(data.articles || []).some((a) => a.url === art.url)) { data.articles.unshift({ ...art, id: crypto.randomUUID(), category: findSite(data, u.hostname)?.category || "General", savedAt: new Date().toISOString(), status: "unread", progress: 0 }); await save(); } }
      else { await save(); await saveArticleFromUrl(tab.url, findSite(data, u.hostname)?.category); await reloadArticles(); }
      setStatus(`${$("view-status").textContent} Article saved too.`); render();
    } catch { /* article capture is optional */ }
  }
}
async function updateSite(domain, key, value) {
  let s = findSite(data, domain);
  if (!s) { s = { domain, version: 1, enabled: true, tags: [] }; data.settings.websites.push(s); }
  if (key === "tags") value = String(value).split(",").map((x) => x.trim()).filter(Boolean);
  s[key] = value; s.version = (s.version || 1) + 1; s.updatedAt = new Date().toISOString();
  if (key === "category") { s.categoryLocked = true; s.autoCategory = false; if (lib().websiteData[domain]) lib().websiteData[domain].category = value; }
  await save(); render();
}
function openAddDialog(message = "") {
  $("add-msg").textContent = message; $("add-url").value = ""; $("add-kind").value = currentView === "news" ? "news" : currentView === "profiles" ? "profile" : "auto";
  $("add-dialog").showModal(); $("add-url").focus();
}

/* ---------- events ---------- */
$("side-nav").onclick = (e) => { const b = e.target.closest("[data-view]"); if (b) { currentView = b.dataset.view; render(); } };
$("search").oninput = render;
$("hints").onclick = (e) => { const h = e.target.closest("[data-hint]"); if (h) { $("search").value = h.dataset.hint; render(); } };
$("add").onclick = () => addCurrentTab().catch((e) => setStatus(e.message, true));
$("add-url-btn").onclick = () => openAddDialog();
$("refresh").onclick = () => { const view = allWebsites().filter((x) => (currentView === "news" ? isNews(x) : !isNews(x))); pool(view.map((x) => x.domain), 3, "Refreshing").catch((e) => setStatus(e.message, true)); };
$("export").onclick = () => download("my-reading-library.json", { ...lib(), websites: sites() });
$("import").onclick = () => $("file").click();
$("file").onchange = async (e) => {
  try {
    const v = JSON.parse(await e.target.files[0].text());
    if (Array.isArray(v)) { let n = 0; for (const it of v) if (it.domain && !findSite(data, it.domain)) { data.settings.websites.push(it); n++; } setStatus(`Imported ${n} website(s). Fetching their data…`); await save(); render(); pool(v.map((i) => i.domain).filter(Boolean), 3, "Fetching logos & data"); e.target.value = ""; return; }
    if (v.categories || v.websiteData) { const l = lib(); data.readingLibrary = { ...l, ...v, favorites: [...new Set([...l.favorites, ...(v.favorites || [])])], profiles: [...(v.profiles || []), ...l.profiles.filter((p) => !(v.profiles || []).some((q) => q.id === p.id))] }; for (const it of v.websites || []) if (it.domain && !findSite(data, it.domain)) data.settings.websites.push(it); }
    else if (v.category) lib().categories[v.category] = v.items || [];
    else throw Error("Unsupported library JSON.");
    await save(); render(); setStatus("Library imported successfully.");
  } catch (err) { setStatus(err.message, true); }
  e.target.value = "";
};
$("open-options").onclick = () => chrome.runtime.openOptionsPage();
$("open-adapters").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html#adapters") });
$("add-cancel").onclick = () => $("add-dialog").close();
$("add-tab").onclick = async () => { const t = await lastWebTab(); if (t) { $("add-url").value = t.url; $("add-msg").textContent = ""; } else $("add-msg").textContent = "No open web page found in your other tabs."; };
$("add-form").onsubmit = async (e) => { e.preventDefault(); const url = $("add-url").value, kind = $("add-kind").value; $("add-dialog").close(); try { await addSite(url, kind); } catch (err) { setStatus(err.message, true); } };
$("detail-close").onclick = () => $("detail").close();
$("detail").addEventListener("close", () => { detail = null; });
$("detail-tabs").onclick = (e) => { const b = e.target.closest("[data-dtab]"); if (b && detail) { detail.tab = b.dataset.dtab; renderDetail(); } };

document.addEventListener("submit", async (e) => {
  const f = e.target.closest("[data-form]"); if (!f) return; e.preventDefault();
  const url = f.elements.url.value.trim(); if (!url) return;
  try { await addSite(url, { site: "site", news: "news", profile: "profile" }[f.dataset.form]); } catch (err) { setStatus(err.message, true); }
});
document.addEventListener("change", async (e) => {
  const ac = e.target.closest("[data-article-cat]");
  if (ac) { const a = data.articles.find((x) => x.id === ac.dataset.articleCat); if (a) { a.category = ac.value; a.categoryLocked = true; a.categoryReason = "Manually selected in Saved Articles."; const l = lib(); for (const [c, items] of Object.entries(l.categories)) l.categories[c] = (items || []).filter(x => x.id !== a.id); l.categories[a.category] = [a, ...(l.categories[a.category] || [])]; await save(); render(); renderDetail(); } return; }
  const c = e.target;
  if (c.dataset.siteKey) { await updateSite(c.dataset.domain, c.dataset.siteKey, c.type === "checkbox" ? c.checked : c.value); return; }
  if (c.dataset.actChange === "cat") { await updateSite(c.dataset.d, "category", c.value); renderDetail(); }
  if (c.dataset.actChange === "country") { const m = (lib().websiteData[c.dataset.d] ||= { domain: c.dataset.d }); m.country = c.value.trim() || "Global"; m.countryLocked = true; await save(); render(); }
});
document.addEventListener("click", async (e) => {
  const chip = e.target.closest("[data-cat],[data-country]");
  if (chip) { if (chip.dataset.cat) catFilter = chip.dataset.cat; if (chip.dataset.country) countryFilter = chip.dataset.country; render(); return; }
  const pre = e.target.closest("[data-preset]");
  if (pre) { try { await addSite(pre.dataset.preset, "news", { name: pre.dataset.name, country: pre.dataset.country }); } catch (err) { setStatus(err.message, true); } return; }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const d = b.dataset.d, act = b.dataset.act, label = b.textContent;
  try {
    if (act === "fav") { const f = lib().favorites; lib().favorites = f.includes(d) ? f.filter((x) => x !== d) : [...f, d]; await save(); render(); }
    else if (act === "expand") { expanded[d] = !expanded[d]; render(); }
    else if (act === "detail") openDetail("site", d);
    else if (act === "detail-p") openDetail("profile", d);
    else if (act === "article-detail") openDetail("savedArticle", d);
    else if (act === "refresh") { setStatus(`Refreshing ${d}…`); await refreshDomain(d); }
    else if (act === "refresh-p") { const old = lib().profiles.find((p) => p.id === d); setStatus(`Refreshing ${old.name}…`); applyProfile(data, await fetchProfileBundle(old.url)); await save(); render(); setStatus(`Updated ${old.name}.`); }
    else if (act === "open-site") chrome.tabs.create({ url: lib().websiteData[d]?.url || `https://${d}` });
    else if (act === "open-p") chrome.tabs.create({ url: lib().profiles.find((p) => p.id === d)?.url });
    else if (act === "dl-site") download(`${d.replace(/[^a-z0-9]+/gi, "-")}.json`, { website: lib().websiteData[d] || {}, settings: findSite(data, d), articles: data.articles.filter((a) => stripWww(a.domain) === stripWww(d)) });
    else if (act === "rm-site") { data.settings.websites = (data.settings.websites || []).filter((x) => stripWww(siteProfile(x).domain) !== stripWww(d)); delete lib().websiteData[d]; await save(); render(); setStatus(`${d} removed. Saved articles remain available.`); }
    else if (act === "rm-p") { lib().profiles = lib().profiles.filter((p) => p.id !== d); await save(); render(); }
    else if (act === "read") chrome.tabs.create({ url: chrome.runtime.getURL(`src/reader/reader.html?articleId=${encodeURIComponent(d)}#reader`) });
    else if (act === "dl-article") { const a = data.articles.find((x) => x.id === d); if (a) download(`${(a.title || "article").replace(/[^a-z0-9]+/gi, "-")}.json`, a); }
    else if (act === "rm-article") { data.articles = (data.articles || []).filter((x) => x.id !== d); await save(); render(); }
    else if (act === "dl-cat") download(`${d.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`, { version: 3, category: d, websites: allWebsites().filter((x) => categoryOf(x) === d).map((x) => ({ site: x.site, data: x.meta })), items: lib().categories[d] || [] });
    else if (act === "open-cat") { catFilter = d; currentView = "websites"; render(); }
    else if (act === "tag") { $("search").value = d; currentView = "all"; render(); }
    else if (act === "seo-article") { const a = data.articles.find((x) => x.id === d); openArticleSeo(a.url); }
    else if (act === "seo-item") openArticleSeo(lib().websiteData[d].latest[+b.dataset.n].link);
    else if (act === "seo-pitem") openArticleSeo(lib().profiles.find((p) => p.id === d).latest[+b.dataset.n].link);
    else if (act === "seo-pick-run") { const u = $("seo-pick").value; if (u) auditUrl(u); }
    else if (act === "save-item" || act === "save-pitem") {
      const item = act === "save-item" ? lib().websiteData[d].latest[+b.dataset.n] : lib().profiles.find((p) => p.id === d).latest[+b.dataset.n];
      b.textContent = "Saving…"; b.disabled = true;
      const a = await saveArticleFromUrl(item.link, act === "save-item" ? categoryOf(allWebsites().find((s) => s.domain === d)) : ""); await reloadArticles();
      b.textContent = "Saved ✓"; setStatus(`Saved “${a.title}”.`); render();
    }
    else if (act === "google-saved") { const a = data.articles.find((x) => x.id === d); if (!a) return; b.disabled = true; b.textContent = "Running Google audit…"; try { a.google = await runGoogleAudit(a.url, b.dataset.s || "mobile"); a.googleError = ""; await save(); } catch(e) { a.googleError = e.message; await save(); } b.disabled = false; b.textContent = "Refresh Google SEO"; renderDetail(); }
    else if (act === "google" || act === "google-url") {
      const url = act === "google" ? lib().websiteData[d]?.url || `https://${d}` : b.dataset.u; b.disabled = true; b.textContent = "Running Google audit… (up to a minute)"; busyDetail = true;
      let g; try { g = await runGoogleAudit(url, b.dataset.s); } finally { busyDetail = false; }
      if (act === "google") { const m = lib().websiteData[d]; m.google = { ...(m.google || {}), [b.dataset.s]: g }; }
      else { const r = lib().seoPages?.[url] || detail?.result; if (r) { r.google = g; (lib().seoPages ||= {})[r.url] = r; } if (detail?.type === "article") detail.result = r; }
      await save(); renderDetail();
    }
    else if (act === "copy-raw") { await navigator.clipboard.writeText($("raw-json").textContent); setStatus("Raw data copied."); }
    else if (act === "dl-raw") download(`${String(detail.key || "data").replace(/[^a-z0-9]+/gi, "-")}.json`, JSON.parse($("raw-json").textContent));
  } catch (err) { setStatus(err.message || "Action failed.", true); b.disabled = false; b.textContent = label; }
});

render();
// First run / newly imported list: fetch logos and data in the background, 3 websites at a time.
const pending = allWebsites().filter((x) => !x.meta.fetchedAt).map((x) => x.domain);
if (pending.length) pool(pending, 3, "Fetching logos & data").catch((e) => setStatus(e.message, true));

// Consistent bottom-corner feedback for library action buttons.
document.addEventListener("click", event => { const b=event.target.closest("button"); if(!b) return; const n=data?.settings?.notifications||{}; if(n.enabled===false||n.events?.action===false) return; let host=document.getElementById("cmj-library-toast-host"); if(!host){host=document.createElement("div");host.id="cmj-library-toast-host";document.body.append(host);} host.dataset.position=["top-left","top-right","bottom-left","bottom-right"].includes(n.position)?n.position:"bottom-right"; const t=document.createElement("div");t.className="cmj-options-toast";t.textContent=`${(b.textContent||"Action").trim().replace(/\s+/g," ").slice(0,48)} clicked`;host.append(t);setTimeout(()=>t.remove(),Number(n.durationMs||2600));},{capture:true});
