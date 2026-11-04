/**
 * My Reading Library controller for websites, profiles, saved articles and metadata.
 */
import { getAll } from "../lib/storage.js";
import { canonical, clone } from "../lib/storage-merge.js";
import { CATEGORIES, NEWS_PRESETS, libraryOf, siteProfile, findSite, stripWww, parseUrlInput, detectProfile, fetchSiteBundle, fetchProfileBundle, applyBundle, applyProfile, persistLibrary, seedFromBundle, lastWebTab, saveArticleFromUrl, seoForUrl, runGoogleAudit, googleLinks } from "../lib/sites.js";
await seedFromBundle();
let data = await getAll();
libraryOf(data);
/** Keys the Library page owns; snapshots of them drive the three-way merge on save. */
const LIBRARY_KEYS = ["settings", "readingLibrary", "articles"];
const snapshot = () => clone(Object.fromEntries(LIBRARY_KEYS.map((key) => [key, data[key]])));
/** What this page last loaded or saved. */
let baseline = snapshot();
/** Storage events before this time were caused by this page's own save. */
let ignoreStorageEventsUntil = 0;
let currentView = "websites";
let catFilter = "All", countryFilter = "All";
const expanded = {};
let detail = null; // { type:'site'|'profile'|'article', key, tab, result, error }
let queue = Promise.resolve();
const $ = (id) => document.getElementById(id);
/** Download text data without requiring a server or external dependency. */
function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lib = () => libraryOf(data);
const sites = () => (data.settings.websites || []).map(siteProfile);
const words = (a) => (a.text || "").split(/\s+/).filter(Boolean).length;
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
const ago = (iso) => {
    if (!iso)
        return "never";
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const setStatus = (msg, error = false) => { $("view-status").textContent = msg; $("view-status").style.color = error ? "#fca5a5" : "#a7f3d0"; };
/** Save library changes, merged with whatever other pages saved in the meantime. */
const save = () => (queue = queue.then(async () => {
    ignoreStorageEventsUntil = Date.now() + 1000;
    const merged = await persistLibrary(data, baseline);
    for (const key of LIBRARY_KEYS) if (canonical(data[key]) !== canonical(merged[key])) data[key] = merged[key];
    libraryOf(data);
    baseline = snapshot();
}).catch((e) => setStatus(e.message, true)));
const hl = (text, q) => {
    if (!q)
        return esc(text);
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    let out = "", last = 0;
    const s = String(text || "");
    s.replace(re, (m, off) => { out += esc(s.slice(last, off)) + `<mark class="highlight">${esc(m)}</mark>`; last = off + m.length; return m; });
    return out + esc(s.slice(last));
};
function download(name, value) {
    const b = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), u = URL.createObjectURL(b), a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
}
const reloadArticles = async () => { const fresh = await getAll(); data.articles = fresh.articles; };
/* ---------- logos (official logo first, then favicon services, then a letter) ---------- */
function logoList(domain, meta = {}) {
    const host = stripWww(domain);
    return [...new Set([meta.logo, ...(meta.logoFallbacks || []), `https://www.google.com/s2/favicons?domain=${host}&sz=128`, `https://icons.duckduckgo.com/ip3/${host}.ico`].filter(Boolean))];
}
function logoImg(list, letter, cls = "") {
    if (!list.length)
        return `<span class="logo-wrap ${cls}">\
<b class="logo-letter show">${esc((letter || "?")[0].toUpperCase())}</b>\
</span>`;
    const [first, ...rest] = list;
    return `<span class="logo-wrap ${cls}">\
<img class="logo" src="${esc(first)}" data-fb="${esc(JSON.stringify(rest))}" alt="" loading="lazy" referrerpolicy="no-referrer">\
<b class="logo-letter">${esc((letter || "?")[0].toUpperCase())}</b>\
</span>`;
}
document.addEventListener("error", (e) => {
    const i = e.target;
    if (i.tagName !== "IMG" || !i.classList.contains("logo"))
        return;
    const fb = JSON.parse(i.dataset.fb || "[]");
    const next = fb.shift();
    if (next) {
        i.dataset.fb = JSON.stringify(fb);
        i.src = next;
    }
    else {
        i.style.display = "none";
        i.nextElementSibling?.classList.add("show");
    }
}, true);
/* ---------- data helpers ---------- */
function allWebsites() {
    const l = lib();
    const out = new Map();
    for (const s of sites())
        out.set(stripWww(s.domain), { domain: s.domain, site: s });
    for (const d of Object.keys(l.websiteData))
        if (!out.has(stripWww(d)))
            out.set(stripWww(d), { domain: d, site: siteProfile(findSite(data, d) || { domain: d }) });
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
    <div class="site-head">${logoImg(logoList(domain, meta), nameOf(x))}<div class="site-id">\
<div class="site-title">${hl(nameOf(x), q)}</div>\
<div class="site-url">${hl(domain, q)}</div>\
</div>\
<button class="btn star" data-act="fav" data-d="${esc(domain)}" title="Favorite">${fav ? "★" : "☆"}</button>\
</div>
    <div class="badges">${badges(x)}</div>
    ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    <p class="meta clamp">${esc(blurb)}</p>
    <div class="site-actions">\
<button class="primary-sm" data-act="detail" data-d="${esc(domain)}">Details</button>\
<button data-act="refresh" data-d="${esc(domain)}">Refresh</button>\
<button data-act="expand" data-d="${esc(domain)}">${open ? "Hide settings" : "Settings"}</button>\
<button data-act="open-site" data-d="${esc(domain)}">Open ↗</button>\
<button data-act="dl-site" data-d="${esc(domain)}">Download</button>\
<button data-act="rm-site" data-d="${esc(domain)}">Remove</button>\
</div>
    ${open ? siteSettings(domain, site) : ""}</article>`;
}
function siteSettings(domain, s) {
    const bools = [["Enable website", "enabled"],
    ["Main toolbar", "toolbar"],
    ["Vocabulary toolbar", "vocabulary"],
    ["Media toolbar", "media"],
    ["Focus tools", "focus"],
    ["Productivity toolbar", "productivity"],
    ["Native reading", "nativeReading"],
    ["Auto translate", "autoTranslate"],
    ["Auto-save vocabulary", "autoSave"],
    ["Language-learning website", "languageLearning"]];
    const sel = (key, vals) => `<select data-site-key="${key}" data-domain="${esc(domain)}">${vals.map((v) => `<option ${s[key] === v ? "selected" : ""}>${v}</option>`).join("")}</select>`;
    const row = (label, ctl, small = "") => `<div class="setting">\
<div>\
<strong>${label}</strong>${small ? `<small>${small}</small>` : ""}</div>${ctl}</div>`;
    const cats = [...new Set([...CATEGORIES, s.category || "General"])];
    return `<div class="settings-panel">\
<h3>Settings · ${esc(domain)}</h3>${bools.map(([l, k]) => `<label class="setting">\
<div>\
<strong>${l}</strong>\
<small>Saved for this website</small>\
</div>\
<input type="checkbox" data-site-key="${k}" data-domain="${esc(domain)}" ${(k === "languageLearning" ? s[k] === true : s[k] !== false) ? "checked" : ""}>\
</label>`).join("")}
    ${row("Learning language", `<select data-site-key="learningLanguage" data-domain="${esc(domain)}">${["en", "ur", "de", "fr", "es", "ar", "tr"].map((value) => `<option value="${value}" ${(s.learningLanguage || "en") === value ? "selected" : ""}>${value.toUpperCase()}</option>`).join("")}</select>`, "Used for articles saved from this website.")}
    ${row("Toolbar type", sel("toolbarType", ["floating", "navbar", "sidebar", "right-sidebar", "bottom-navbar", "bubble"]))}${row("Toolbar theme", sel("toolbarTheme", ["midnight", "graphite", "paper", "ocean", "forest"]))}
    ${row("Media theme", sel("mediaTheme", ["midnight", "sunset", "ocean"]))}${row("Vocabulary theme", sel("vocabularyTheme", ["violet", "amber", "mint"]))}${row("Productivity theme", sel("productivityTheme", ["focus", "green", "orange"]))}${row("Position", sel("position", ["top", "bottom", "left", "right"]))}
    ${row("Category", `<select data-site-key="category" data-domain="${esc(domain)}">${cats.map((v) => `<option ${s.category === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>`, "Changing it locks the category (no more auto-detect).")}
    ${row("Tags", `<input data-site-key="tags" data-domain="${esc(domain)}" value="${esc((s.tags || []).join(", "))}">`, "Comma-separated")}</div>`;
}
function chipsFor(items, current, attr) {
    const counts = {};
    items.forEach((c) => (counts[c] = (counts[c] || 0) + 1));
    return `<div class="chips">\
<button class="chip ${current === "All" ? "on" : ""}" data-${attr}="All">All <i>${items.length}</i>\
</button>${Object.entries(counts).sort().map(([c, n]) => `<button class="chip ${current === c ? "on" : ""}" data-${attr}="${esc(c)}">${esc(c)} <i>${n}</i>\
</button>`).join("")}</div>`;
}
const addBar = (id, placeholder, btn) => `<form class="addbar" data-form="${id}">\
<input name="url" autocomplete="off" placeholder="${placeholder}">\
<button class="primary-sm" type="submit">${btn}</button>\
</form>`;
/* ---------- views ---------- */
function renderWebsites(q) {
    const base = allWebsites().filter((x) => !isNews(x));
    const items = base.filter((x) => (catFilter === "All" || categoryOf(x) === catFilter) && (!q || JSON.stringify([x.domain, x.meta.title, x.meta.description, x.site.tags, categoryOf(x)]).toLowerCase().includes(q))).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    $("library-view").innerHTML = `<div class="section-head">\
<h2>Websites &amp; Blogs</h2>\
<span class="meta">${items.length} of ${base.length} website(s)</span>\
</div>${addBar("site", "Paste a website or blog address (e.g. https://dev.to)…", "＋ Add website")}${chipsFor(base.map(categoryOf), catFilter, "cat")}<div class="grid">${items.map((x) => siteCard(x, q)).join("") || '<div class="empty">No matching websites. Use “Add current website” or paste an address above.</div>'}</div>`;
}
function renderNews(q) {
    const base = allWebsites().filter(isNews);
    const items = base.filter((x) => (countryFilter === "All" || (x.meta.country || "Global") === countryFilter) && (!q || JSON.stringify([x.domain, x.meta.title, x.meta.description, x.meta.country]).toLowerCase().includes(q))).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const have = new Set(base.map((x) => stripWww(x.domain)));
    const presets = NEWS_PRESETS.filter((p) => !have.has(stripWww(new URL(p.url).hostname)));
    $("library-view").innerHTML = `<div class="section-head">\
<h2>Newspapers &amp; News</h2>\
<span class="meta">${items.length} of ${base.length} newspaper(s)</span>\
</div>${addBar("news", "Paste any newspaper or news website address…", "＋ Add newspaper")}
    ${presets.length ? `<div class="presets">\
<span class="meta">Quick add:</span>${presets.map((p) => `<button class="hint" data-preset="${esc(p.url)}" data-name="${esc(p.name)}" data-country="${esc(p.country)}">${esc(p.name)}</button>`).join("")}</div>` : ""}
    ${base.length ? chipsFor(base.map((x) => x.meta.country || "Global"), countryFilter, "country") : ""}
    <div class="grid">${items.map((x) => siteCard(x, q)).join("") || '<div class="empty">No newspapers yet. Add your favourite newspaper websites from anywhere in the world — paste an address above or tap a quick-add name.</div>'}</div>`;
}
function profileCard(p, q) {
    return `<article class="card site-card">\
<div class="site-head">${logoImg([p.avatar, ...(p.avatarFallbacks || [])].filter(Boolean), p.name, "round")}<div class="site-id">\
<div class="site-title">${hl(p.name, q)}</div>\
<div class="site-url">${esc(p.platform)} · @${esc(p.handle)}</div>\
</div>\
</div>
    <div class="badges">\
<span class="badge cat">${esc(p.category || "General")}</span>${p.followers ? `<span class="badge">${esc(p.followers)} followers</span>` : ""}<span class="badge">${(p.latest || []).length} recent posts</span>\
</div>
    <p class="meta clamp">${esc(p.bio || "No bio published.")}</p>
    ${(p.latest || []).slice(0, 3).map((i) => `<a class="mini-link" href="${esc(i.link)}" target="_blank" rel="noopener">• ${esc(i.title)}</a>`).join("")}
    <div class="site-actions">\
<button class="primary-sm" data-act="detail-p" data-d="${esc(p.id)}">Details</button>\
<button data-act="refresh-p" data-d="${esc(p.id)}">Refresh</button>\
<button data-act="open-p" data-d="${esc(p.id)}">Open ↗</button>\
<button data-act="rm-p" data-d="${esc(p.id)}">Remove</button>\
</div>\
</article>`;
}
function renderProfiles(q) {
    const list = lib().profiles.filter((p) => !q || JSON.stringify([p.name, p.handle, p.bio, p.platform, p.category]).toLowerCase().includes(q));
    $("library-view").innerHTML = `<div class="section-head">\
<h2>Profile Pages</h2>\
<span class="meta">${list.length} of ${lib().profiles.length} profile(s) · Medium, DEV, Substack, Hashnode, GitHub and more</span>\
</div>${addBar("profile", "Paste a profile link (e.g. https://medium.com/@username)…", "＋ Add profile")}<div class="grid">${list.map((p) => profileCard(p, q)).join("") || '<div class="empty">No profiles yet. Paste a writer’s profile link above, for example https://medium.com/@username.</div>'}</div>`;
}
function renderArticles(q, filter) {
    let list = [...(data.articles || [])];
    if (filter === "favorites")
        list = list.filter((a) => lib().favorites.includes(a.domain));
    if (filter === "recent")
        list.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
    if (q)
        list = list.filter((a) => JSON.stringify(a).toLowerCase().includes(q));
    $("library-view").innerHTML = `<div class="section-head">\
<h2>${filter === "favorites" ? "Favorite" : filter === "recent" ? "Recent" : "Saved"} Articles</h2>\
<span class="meta">${list.length} record(s)</span>\
</div>${list.map((a) => `<article class="article">${a.thumbnail ? `<img class="article-thumb" src="${esc(a.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<h3>${hl(a.title || a.domain, q)}</h3>${a.subtitle ? `<p class="meta">${hl(a.subtitle, q)}</p>` : ""}<div class="meta">${hl(a.domain || "", q)} · ${a.wordCount || words(a)} words · ${esc(a.category || findSite(data, a.domain)?.category || "General")}${a.rank?.rank ? ` · Rank #${fmt(a.rank.rank)}` : ""}${a.google?.seo != null ? ` · Google SEO ${a.google.seo}` : ""}</div>\
<p>${hl((a.text || "").slice(0, 600), q)}</p>\
<div class="site-actions">\
<button class="primary-sm" data-act="article-detail" data-d="${esc(a.id)}">Details</button>\
<button data-act="read" data-d="${esc(a.id)}">Read</button>\
<button data-act="seo-article" data-d="${esc(a.id)}">SEO</button>\
<button data-act="dl-article" data-d="${esc(a.id)}">Download</button>\
<button data-act="rm-article" data-d="${esc(a.id)}">Remove</button>\
</div>\
</article>`).join("") || '<div class="empty">No saved articles.</div>'}`;
}
function renderCategories(q) {
    const map = {};
    for (const x of allWebsites())
        (map[categoryOf(x)] ||= { sites: [], articles: 0 }).sites.push(x);
    for (const p of lib().profiles)
        map[p.category || "General"] ||= { sites: [], articles: 0 };
    for (const [c, items] of Object.entries(lib().categories))
        (map[c] ||= { sites: [], articles: 0 }).articles = items.length;
    for (const c of data.settings.libraryCustomCategories || [])
        map[c] ||= { sites: [], articles: 0 };
    const entries = Object.entries(map).filter(([c, v]) => !q || (c + v.sites.map((s) => s.domain).join(" ")).toLowerCase().includes(q)).sort((a, b) => b[1].sites.length - a[1].sites.length);
    $("library-view").innerHTML = `<div class="section-head">\
<h2>Categories</h2>\
<span class="meta">Categories are detected automatically from what each site publishes.</span>\
<button data-act="add-cat">＋ Add category</button>\
</div>\
<div class="grid">${entries.map(([c, v]) => `<article class="card">\
<h3>${hl(c, q)}</h3>\
<div class="meta">${v.sites.length} website(s) · ${v.articles} saved article(s)</div>\
<div class="logo-row">${v.sites.slice(0, 8).map((s) => logoImg(logoList(s.domain, s.meta), nameOf(s), "sm")).join("")}</div>\
<div class="site-actions">\
<button data-act="open-cat" data-d="${esc(c)}">Open</button>\
<button data-act="detail-cat" data-d="${esc(c)}">Details</button>\
<button data-act="edit-cat" data-d="${esc(c)}">Edit</button>\
<button data-act="remove-cat" data-d="${esc(c)}">Remove</button>\
<button data-act="dl-cat" data-d="${esc(c)}">Download JSON</button>\
</div>\
</article>`).join("") || '<div class="empty">No categories yet.</div>'}</div>`;
}
function renderTags(q) {
    const tags = {};
    for (const s of sites())
        for (const t of s.tags || [])
            tags[t] = (tags[t] || 0) + 1;
    for (const a of data.articles || [])
        for (const t of [...(a.tags || []), ...(a.labels || [])])
            tags[t] = (tags[t] || 0) + 1;
    for (const t of data.settings.libraryCustomTags || [])
        tags[t] = tags[t] || 0;
    const entries = Object.entries(tags).filter(([t]) => !q || t.toLowerCase().includes(q)).sort((a, b) => b[1] - a[1]);
    $("library-view").innerHTML = `<div class="section-head">\
<h2>Tags &amp; Labels</h2>\
<button data-act="add-tag">＋ Add tag</button>\
</div>\
<div class="grid">${entries.map(([t, n]) => `<article class="card">\
<h3>${hl(t, q)}</h3>\
<div class="meta">${n} record(s)</div>\
<div class="site-actions"><button data-act="tag" data-d="${esc(t)}">Search tag</button><button data-act="edit-tag" data-d="${esc(t)}">Rename</button><button data-act="remove-tag" data-d="${esc(t)}">Remove</button></div>\
</article>`).join("") || '<div class="empty">No tags yet.</div>'}</div>`;
}
/** Render only articles explicitly associated with a language-learning website or workflow. */
function renderLearningLanguage(q) {
    const learningDomains = new Set((data.settings.websites || [])
        .filter((site) => site.languageLearning === true)
        .map((site) => stripWww(site.domain)));
    const articles = (data.articles || []).filter((article) =>
        article.languageLearning === true ||
        learningDomains.has(stripWww(article.domain || ""))
    );
    const filtered = articles.filter((article) => !q ||
        `${article.title || ""} ${article.domain || ""} ${article.author || ""} ${article.url || ""}`
            .toLowerCase().includes(q));

    $("library-view").innerHTML = `<div class="section-head">
        <h2>Learning Language</h2>
        <span class="meta">${filtered.length} of ${articles.length} learning article(s)</span>
    </div>
    <div class="site-actions learning-library-actions">
        <button data-add-learning-website>＋ Add Website</button>
        <button data-open-learning>Open Language Learning workspace</button>
        <button data-export-learning-csv>Export CSV</button>
        <button data-export-learning-md>Export Markdown</button>
    </div>
    <div class="grid">${filtered.map((article) => `<article class="card learning-library-card">
        ${(article.thumbnail || article.image) ? `<img class="learning-library-thumb" src="${esc(article.thumbnail || article.image)}" alt="Article thumbnail" loading="lazy" referrerpolicy="no-referrer">` : `<div class="learning-library-thumb learning-library-thumb-empty">Article preview unavailable</div>`}
        <div class="site-head">${logoImg(logoList(article.domain || "", { logo: article.logo }), article.siteName || article.domain || "Article")}
            <div class="site-id"><div class="site-title">${hl(article.title || "Untitled article", q)}</div>
            <div class="site-url">${hl(article.domain || article.url || "", q)}</div></div>
        </div>
        <p class="meta">${esc(article.author || "Author not detected")} · ${esc(article.publishedAt || article.date || "Publication date unavailable")} · ${esc(article.languageName || article.language || "Language not set")}</p>
        <p class="meta clamp">${esc(article.description || "Saved for language learning.")}</p>
        <div class="site-actions"><button data-open-learning-article="${esc(article.id)}">Open learning article</button>
        <button data-learning-details="${esc(article.id)}">Article details</button>
        <button data-refresh-learning-article="${esc(article.id)}">Fetch / Refresh</button></div>
    </article>`).join("") || '<div class="empty">No learning articles yet. Mark a website as a language-learning website or save an article from Language Learning Mode.</div>'}</div>`;
}
/** Render saved bookmarks from the shared Reader bookmark collection. */
function renderBookmarks(q) {
    const records = (data.bookmarks || []).filter((item) => !q || JSON.stringify(item).toLowerCase().includes(q));
    $("library-view").innerHTML = `<div class="section-head"><h2>Bookmarks</h2><span class="meta">${records.length} saved reading position(s)</span></div>
      <div class="site-actions"><button data-bookmarks-export>Export bookmarks JSON</button><button data-bookmarks-import>Import bookmarks JSON</button><input id="bookmarks-import-file" type="file" accept=".json,application/json" hidden></div>
      <div class="grid">${records.map((item) => `<article class="card"><h3>${esc(item.title || "Reading bookmark")}</h3><p>${esc(item.text || "")}</p><p class="meta">${esc(item.url || "")} · ${esc(item.createdAt || "")}</p><div class="site-actions"><button data-bookmark-open="${esc(item.url || "")}">Open source</button><button data-bookmark-remove="${esc(item.id || "")}">Remove</button></div></article>`).join("") || '<div class="empty">No bookmarks saved yet.</div>'}</div>`;
}
function render() {
    const q = $("search").value.trim().toLowerCase();
    document.querySelectorAll("#side-nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === currentView));
    ({
        websites: () => renderWebsites(q),
        news: () => renderNews(q),
        profiles: () => renderProfiles(q),
        favorites: () => renderArticles(q, "favorites"),
        saved: () => renderArticles(q, "all"),
        bookmarks: () => renderBookmarks(q),
        "learning-language": () => renderLearningLanguage(q),
        recent: () => renderArticles(q, "recent"),
        all: () => renderArticles(q, "all"),
        categories: () => renderCategories(q),
        tags: () => renderTags(q)
    }[currentView] || (() => { }))();
    $("hints").innerHTML = q ? [...new Set([...allWebsites().map((x) => x.domain), ...allWebsites().map(categoryOf)].filter((x) => x.toLowerCase().includes(q)))].slice(0, 8).map((x) => `<span class="hint" data-hint="${esc(x)}">${esc(x)}</span>`).join("") : "";
}
let renderTimer;
const renderSoon = () => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
        render();
        if (detail && detail.type !== "article" && $("detail").open && !busyDetail)
            renderDetail();
    }, 150);
};
let busyDetail = false;
/* ---------- SEO / detail rendering ---------- */
const ring = (score, label) => `<div class="ring-box">\
<div class="ring ${score == null ? "na" : score >= 80 ? "g" : score >= 55 ? "o" : "r"}" style="--p:${score ?? 0}">\
<b>${score ?? "—"}</b>\
</div>\
<small>${esc(label)}</small>\
</div>`;
function seoBlock(res, title = "On-page SEO") {
    const a = res.audit;
    if (!a)
        return '<div class="empty">No audit data yet.</div>';
    const icon = { pass: "✓", warn: "!", fail: "✕" };
    return `<div class="seo-top">${ring(a.score, title)}<ul class="checks">${a.checks.map((c) => `<li class="${c.status}">\
<i>${icon[c.status]}</i>\
<div>\
<strong>${esc(c.label)}</strong>\
<small>${esc(c.detail)}</small>\
</div>\
</li>`).join("")}</ul>\
</div>`;
}
function rankBlock(r) {
    if (!r)
        return "";
    if (!r.rank)
        return `<div class="note">Domain popularity (Tranco): ${esc(r.note || "not ranked")}</div>`;
    const hist = (r.history || []).slice().reverse();
    const max = Math.max(...hist.map((h) => h.rank)), min = Math.min(...hist.map((h) => h.rank));
    return `<div class="rank-box">\
<div>\
<small>Domain popularity rank (Tranco · lower is better)</small>\
<div class="rank-num">#${fmt(r.rank)}</div>\
<small>${esc(r.domain)} · ${esc(r.date || "")}</small>\
</div>\
<div class="spark" title="Last ${hist.length} days">${hist.map((h) => `<span style="height:${max === min ? 50 : 15 + ((max - h.rank) / (max - min)) * 85}%" title="${esc(h.date)}: #${fmt(h.rank)}">\
</span>`).join("")}</div>\
</div>`;
}
function googleBlock(g) {
    if (!g)
        return '<div class="note">No Google audit yet. Run one below.</div>';
    return `<div class="g-scores">${ring(g.seo, "Google SEO")}${ring(g.performance, "Performance")}${ring(g.accessibility, "Accessibility")}${ring(g.bestPractices, "Best practices")}</div>\
<div class="note">${esc(g.strategy)} test · ${esc(ago(g.fetchedAt))}${g.lcp ? ` · LCP ${esc(g.lcp)} · CLS ${esc(g.cls)} · TBT ${esc(g.tbt)}` : ""}</div>${g.failingSeo?.length ? `<div class="note">\
<strong>Google flags:</strong> ${g.failingSeo.map(esc).join(" · ")}</div>` : ""}`;
}
const linkBtns = (l) => `<div class="site-actions">${Object.entries({ "Google: site:domain": l.site, "Google: this page": l.page, "Google: exact title": l.title, "Google: brand": l.brand }).filter(([, v]) => v).map(([k, v]) => `<a class="linkbtn" href="${esc(v)}" target="_blank" rel="noopener">${k} ↗</a>`).join("")}</div>`;
const HONEST = '<div class="note small">Google does not publish keyword positions for free. This tab shows Google’s own PageSpeed/Lighthouse SEO score, an on-page audit and a public domain-popularity rank. Use the Google buttons to see where a page appears.</div>';
function articleSeoHtml(r) {
    return `<div class="art-seo">\
<h4>${esc(r.title || r.url)}</h4>${rankBlock(r.rank)}${seoBlock(r, "Page SEO")}<h4>Top keywords on this page</h4>\
<div class="tags">${(r.keywords || []).map((k) => `<span class="tag">${esc(k.word)} · ${k.count}</span>`).join("")}</div>\
<div class="note small">${r.words} words · robots.txt ${r.robots?.robots ? "found" : "not found"}${r.robots?.sitemaps?.length ? ` · ${r.robots.sitemaps.length} sitemap(s)` : " · no sitemap listed"}</div>${linkBtns(r.links)}${r.google ? googleBlock(r.google) : ""}<div class="site-actions">\
<button data-act="google-url" data-u="${esc(r.url)}" data-s="mobile">Run Google audit for this page</button>\
</div>${HONEST}</div>`;
}
const rawBlock = (obj) => `<div class="site-actions">\
<button data-act="copy-raw">Copy JSON</button>\
<button data-act="dl-raw">Download JSON</button>\
</div>\
<pre class="raw" id="raw-json">${esc(JSON.stringify(obj, null, 2))}</pre>`;
function renderDetail() {
    const d = detail;
    if (!d)
        return;
    let head = "", tabs = [], content = "";
    if (d.type === "site") {
        const x = allWebsites().find((s) => s.domain === d.key);
        if (!x) {
            $("detail").close();
            return;
        }
        const m = x.meta, s = x.site, pages = Object.values(lib().seoPages || {});
        head = `${logoImg(logoList(x.domain, m), nameOf(x), "lg")}<div>\
<h2>${esc(nameOf(x))}</h2>\
<a class="site-url" href="https://${esc(x.domain)}" target="_blank" rel="noopener">${esc(x.domain)} ↗</a>\
<div class="badges">${badges(x)}</div>\
</div>`;
        tabs = [["overview", "Overview"],
        ["latest", `Latest articles (${(m.latest || []).length})`],
        ["seo", "SEO & Ranking"],
        ["saved", `Saved (${x.articles.length})`],
        ["raw", "Raw data"]];
        if (d.tab === "overview")
            content = `<div class="kv">\
<div>\
<small>Category</small>\
<select data-act-change="cat" data-d="${esc(x.domain)}">${[...new Set([...CATEGORIES, categoryOf(x)])].map((c) => `<option ${c === categoryOf(x) ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>\
<small>${esc(m.categoryReason || "")}${s.categoryLocked ? " (manually set)" : ""}</small>\
</div>\
<div>\
<small>Country</small>\
<input data-act-change="country" data-d="${esc(x.domain)}" value="${esc(m.country || "Global")}">\
</div>\
<div>\
<small>Language</small>\
<b>${esc(m.language || m.lang || "—")}</b>\
</div>\
<div>\
<small>Last fetched</small>\
<b>${esc(ago(m.fetchedAt))}</b>\
</div>\
</div>
      <p class="lead">${esc(m.description || "No description published.")}</p>
      ${m.fetchError ? `<div class="note err">Last fetch failed: ${esc(m.fetchError)}</div>` : ""}${m.blocked ? '<div class="note">This website blocks automated page access, so only the logo, feed and ranking were collected.</div>' : ""}
      ${(m.keywords || []).length ? `<h4>Keywords</h4>\
<div class="tags">${m.keywords.map((k) => `<span class="tag">${esc(k)}</span>`).join("")}</div>` : ""}
      <h4>Feeds</h4>${(m.feeds || []).length ? m.feeds.map((f) => `<a class="mini-link" href="${esc(f)}" target="_blank" rel="noopener">${esc(f)}</a>`).join("") : '<div class="meta">No RSS/Atom feed found.</div>'}
      <h4>Social &amp; profiles</h4>${Object.keys(m.social || {}).length ? `<div class="site-actions">${Object.entries(m.social).map(([k, v]) => `<a class="linkbtn" href="${esc(v)}" target="_blank" rel="noopener">${esc(k)} ↗</a>`).join("")}</div>` : '<div class="meta">None found on the home page.</div>'}
      <h4>Details</h4>\
<table class="kvt">\
<tr>\
<td>Canonical</td>\
<td>${esc(m.canonical || "—")}</td>\
</tr>\
<tr>\
<td>Theme colour</td>\
<td>${m.themeColor ? `<span class="swatch" style="background:${esc(m.themeColor)}">\
</span>` : ""}${esc(m.themeColor || "—")}</td>\
</tr>\
<tr>\
<td>Schema types</td>\
<td>${esc((m.ldTypes || []).join(", ") || "—")}</td>\
</tr>\
<tr>\
<td>Toolbar</td>\
<td>${esc(s.toolbarType || "floating")} · ${esc(s.toolbarTheme || "midnight")} · ${s.enabled === false ? "disabled" : "enabled"}</td>\
</tr>\
<tr>\
<td>Tags</td>\
<td>${esc((s.tags || []).join(", ") || "—")}</td>\
</tr>\
</table>`;
        if (d.tab === "latest")
            content = (m.latest || []).length ? `<div class="list">${m.latest.map((i, n) => `<div class="li">\
<div>\
<a href="${esc(i.link)}" target="_blank" rel="noopener">\
<strong>${esc(i.title)}</strong>\
</a>\
<small>${esc([i.author, i.date].filter(Boolean).join(" · "))}</small>${i.summary ? `<p class="meta">${esc(i.summary)}</p>` : ""}</div>\
<div class="site-actions">\
<button data-act="save-item" data-d="${esc(x.domain)}" data-n="${n}">Save</button>\
<button data-act="seo-item" data-d="${esc(x.domain)}" data-n="${n}">SEO</button>\
</div>\
</div>`).join("")}</div>` : '<div class="empty">No recent articles were found (no RSS/Atom feed, or the site blocks access).</div>';
        if (d.tab === "seo") {
            const options = [...(m.latest || []).map((i) => [i.link, i.title]), ...x.articles.map((a) => [a.url, a.title])].filter(([u]) => u);
            const last = pages.find((r) => {
                try {
                    return stripWww(new URL(r.url).hostname) === stripWww(x.domain);
                }
                catch {
                    return false;
                }
            });
            content = `${rankBlock(m.rank)}<h4>On-page SEO (home page)</h4>${m.seo ? seoBlock({ audit: m.seo }) : '<div class="note">No audit yet. Press Refresh.</div>'}<h4>Google PageSpeed / Lighthouse</h4>${googleBlock((m.google || {}).mobile || (m.google || {}).desktop)}<div class="site-actions">\
<button data-act="google" data-d="${esc(x.domain)}" data-s="mobile">Run Google audit (mobile)</button>\
<button data-act="google" data-d="${esc(x.domain)}" data-s="desktop">Run Google audit (desktop)</button>\
</div>\
<h4>Check on Google</h4>${linkBtns(googleLinks(m.url || `https://${x.domain}`, m.title))}${HONEST}<h4>Audit a single article</h4>\
<div class="site-actions">\
<select id="seo-pick">${options.map(([u, t]) => `<option value="${esc(u)}">${esc((t || u).slice(0, 80))}</option>`).join("") || "<option value=''>No articles available</option>"}</select>\
<button data-act="seo-pick-run">Audit article</button>\
</div>\
<div id="seo-article">${last ? articleSeoHtml(last) : ""}</div>`;
        }
        if (d.tab === "saved")
            content = x.articles.length ? `<div class="list">${x.articles.map((a) => `<div class="li">\
<div>\
<strong>${esc(a.title)}</strong>\
<small>${a.wordCount || words(a)} words · ${esc(ago(a.savedAt))}</small>\
</div>\
<div class="site-actions">\
<button data-act="read" data-d="${esc(a.id)}">Read</button>\
<button data-act="seo-article" data-d="${esc(a.id)}">SEO</button>\
</div>\
</div>`).join("")}</div>` : '<div class="empty">No saved articles from this website yet.</div>';
        if (d.tab === "raw")
            content = rawBlock({ settings: s, data: m });
    }
    else if (d.type === "profile") {
        const p = lib().profiles.find((x) => x.id === d.key);
        if (!p) {
            $("detail").close();
            return;
        }
        head = `${logoImg([p.avatar, ...(p.avatarFallbacks || [])].filter(Boolean), p.name, "lg round")}<div>\
<h2>${esc(p.name)}</h2>\
<a class="site-url" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.platform)} · @${esc(p.handle)} ↗</a>\
<div class="badges">\
<span class="badge cat">${esc(p.category || "General")}</span>${p.followers ? `<span class="badge">${esc(p.followers)} followers</span>` : ""}</div>\
</div>`;
        tabs = [["overview", "Overview"], ["latest", `Posts (${(p.latest || []).length})`], ["raw", "Raw data"]];
        if (d.tab === "overview")
            content = `<p class="lead">${esc(p.bio || "No bio published.")}</p>\
<table class="kvt">\
<tr>\
<td>Platform</td>\
<td>${esc(p.platform)}</td>\
</tr>\
<tr>\
<td>Handle</td>\
<td>@${esc(p.handle)}</td>\
</tr>\
<tr>\
<td>Category</td>\
<td>${esc(p.category)} — ${esc(p.categoryReason || "")}</td>\
</tr>\
<tr>\
<td>Followers</td>\
<td>${esc(p.followers || "not available")}</td>\
</tr>\
<tr>\
<td>Feed</td>\
<td>${esc(p.feedUrl || "—")}</td>\
</tr>\
<tr>\
<td>Last fetched</td>\
<td>${esc(ago(p.fetchedAt))}</td>\
</tr>\
</table>${p.blocked ? '<div class="note">The profile page blocked direct access; data comes from the public feed.</div>' : ""}${Object.keys(p.social || {}).length ? `<h4>Links</h4>\
<div class="site-actions">${Object.entries(p.social).map(([k, v]) => `<a class="linkbtn" href="${esc(v)}" target="_blank" rel="noopener">${esc(k)} ↗</a>`).join("")}</div>` : ""}`;
        if (d.tab === "latest")
            content = (p.latest || []).length ? `<div class="list">${p.latest.map((i, n) => `<div class="li">\
<div>\
<a href="${esc(i.link)}" target="_blank" rel="noopener">\
<strong>${esc(i.title)}</strong>\
</a>\
<small>${esc(i.date || "")}</small>${i.summary ? `<p class="meta">${esc(i.summary)}</p>` : ""}</div>\
<div class="site-actions">\
<button data-act="save-pitem" data-d="${esc(p.id)}" data-n="${n}">Save</button>\
<button data-act="seo-pitem" data-d="${esc(p.id)}" data-n="${n}">SEO</button>\
</div>\
</div>`).join("")}</div>` : '<div class="empty">No public posts were found for this profile.</div>';
        if (d.tab === "raw")
            content = rawBlock(p);
    }
    else if (d.type === "savedArticle") {
        const a = (data.articles || []).find((x) => x.id === d.key);
        if (!a) {
            $("detail").close();
            return;
        }
        head = `${a.thumbnail ? `<img class="logo lg" src="${esc(a.thumbnail)}" alt="" referrerpolicy="no-referrer">` : ""}<div>\
<h2>${esc(a.title || "Saved article")}</h2>\
<a class="site-url" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.url)} ↗</a>\
</div>`;
        tabs = [["overview", "Details"], ["seo", "SEO & Google"], ["raw", "Raw data"]];
        if (d.tab === "overview")
            content = `<div class="kv">\
<div>\
<small>Category</small>\
<select data-article-cat="${esc(a.id)}">${[...new Set([...(data.settings.libraryCustomCategories || CATEGORIES), a.category || "General"])].map((c) => `<option ${c === (a.category || "General") ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>\
<small>${esc(a.categoryReason || "")}</small>\
</div>\
<div>\
<small>Author</small>\
<b>${esc(a.author || "—")}</b>\
</div>\
<div>\
<small>Published</small>\
<b>${esc(a.publishedAt || "—")}</b>\
</div>\
<div>\
<small>Saved</small>\
<b>${esc(ago(a.savedAt))}</b>\
</div>\
</div>\
<h4>${esc(a.subtitle || "Subtitle not available")}</h4>${a.thumbnail ? `<img class="article-hero" src="${esc(a.thumbnail)}" alt="" referrerpolicy="no-referrer">` : ""}<p class="lead">${esc(a.description || "No description available.")}</p>\
<table class="kvt">\
<tr>\
<td>Canonical</td>\
<td>${esc(a.canonical || "—")}</td>\
</tr>\
<tr>\
<td>Site</td>\
<td>${esc(a.siteName || a.domain || "—")}</td>\
</tr>\
<tr>\
<td>Words</td>\
<td>${fmt(a.wordCount || words(a))}</td>\
</tr>\
<tr>\
<td>Reading time</td>\
<td>${esc(a.readingMinutes || "—")} min</td>\
</tr>\
<tr>\
<td>Domain rank</td>\
<td>${a.rank?.rank ? `#${fmt(a.rank.rank)}` : esc(a.rank?.note || "—")}</td>\
</tr>\
<tr>\
<td>Tags</td>\
<td>${esc((a.tags || []).join(", ") || "—")}</td>\
</tr>\
<tr>\
<td>Labels</td>\
<td>${esc((a.labels || []).join(", ") || "—")}</td>\
</tr>\
</table>`;
        if (d.tab === "seo")
            content = `${a.seo ? seoBlock({ audit: a.seo }, "Page SEO") : '<div class="note">No on-page SEO audit stored.</div>'}<h4>Google PageSpeed / Lighthouse</h4>${googleBlock(a.google)}${a.googleError ? `<div class="note err">${esc(a.googleError)}</div>` : ""}<h4>Google checks</h4>${linkBtns(a.googleLinks || googleLinks(a.url, a.title))}${HONEST}<div class="site-actions">\
<button data-act="google-saved" data-d="${esc(a.id)}" data-s="mobile">Refresh Google SEO</button>\
</div>`;
        if (d.tab === "raw")
            content = rawBlock(a);
    }
    else if (d.type === "learning-article") {
        const article = data.articles.find((item) => item.id === d.key);
        if (!article) return;
        head = `<div><h2>${esc(article.title || "Learning article")}</h2><a class="site-url" href="${esc(article.url || "#")}" target="_blank" rel="noopener">${esc(article.url || "Source unavailable")} ↗</a></div>`;
        content = `<div class="kv">
            <div><small>Website</small><b>${esc(article.siteName || article.domain || "—")}</b></div>
            <div><small>Author</small><b>${esc(article.author || "Not detected")}</b></div>
            <div><small>Publication date</small><b>${esc(article.publishedAt || article.date || "Not detected")}</b></div>
            <div><small>Learning language</small><b>${esc(article.languageName || article.language || "Not specified")}</b></div>
            <div><small>Saved</small><b>${esc(article.savedAt || "—")}</b></div>
            <div><small>Word count</small><b>${fmt(article.wordCount || words(article))}</b></div>
        </div>
        ${article.image ? `<img class="detail-article-image" src="${esc(article.image)}" alt="Article thumbnail" referrerpolicy="no-referrer">` : ""}
        <p class="lead">${esc(article.description || article.subtitle || "No article description was detected.")}</p>
        <div class="site-actions"><button data-open-learning-article="${esc(article.id)}">Open learning reader</button><button data-refresh-learning-article="${esc(article.id)}">Fetch / Refresh article</button></div>`;
    }
    else if (d.type === "article") {
        head = `<div>\
<h2>Article SEO</h2>\
<a class="site-url" href="${esc(d.key)}" target="_blank" rel="noopener">${esc(d.key)} ↗</a>\
</div>`;
        content = `<div id="seo-article">${d.result ? articleSeoHtml(d.result) : d.error ? `<div class="note err">${esc(d.error)}</div>` : '<div class="note">Auditing the page… this takes a few seconds.</div>'}</div>`;
    }
    $("detail-head").innerHTML = head;
    $("detail-tabs").innerHTML = tabs.map(([k, l]) => `<button class="${d.tab === k ? "on" : ""}" data-dtab="${k}">${l}</button>`).join("");
    $("detail-body").innerHTML = content;
}
function openDetail(type, key, tab = "overview") {
    detail = { type, key, tab };
    renderDetail();
    if (!$("detail").open)
        $("detail").showModal();
}
async function auditUrl(url) {
    const box = () => $("seo-article");
    if (box())
        box().innerHTML = '<div class="note">Auditing the page… this takes a few seconds.</div>';
    try {
        const r = await seoForUrl(url);
        (lib().seoPages ||= {})[r.url] = r;
        const keys = Object.keys(lib().seoPages);
        if (keys.length > 40)
            delete lib().seoPages[keys[0]];
        if (detail?.type === "article") {
            detail.result = r;
            detail.error = "";
        }
        await save();
        if (box())
            box().innerHTML = articleSeoHtml(r);
    }
    catch (e) {
        if (detail?.type === "article")
            detail.error = e.message;
        if (box())
            box().innerHTML = `<div class="note err">${esc(e.message)}</div>`;
    }
}
function openArticleSeo(url) {
    detail = { type: "article", key: url };
    renderDetail();
    if (!$("detail").open)
        $("detail").showModal();
    auditUrl(url);
}
/* ---------- fetching ---------- */
async function refreshDomain(domain, { quiet = false } = {}) {
    const site = findSite(data, domain);
    const kind = site?.type === "news" ? "news" : "site";
    const prev = lib().websiteData[domain] || {};
    try {
        const b = await fetchSiteBundle(`https://${domain}`, { kind, presetName: prev.presetName || "", presetCountry: prev.presetCountry || (prev.countryLocked ? prev.country : "") });
        b.domain = domain;
        applyBundle(data, b, { kind });
        delete lib().websiteData[domain].fetchError;
        if (!quiet)
            setStatus(`Updated ${b.title} → ${categoryOf({ site: findSite(data, domain), meta: b })}. ${b.categoryReason}`);
    }
    catch (e) {
        lib().websiteData[domain] = { ...prev, domain, fetchedAt: new Date().toISOString(), fetchError: e.message };
        if (!quiet)
            setStatus(`${domain}: ${e.message}`, true);
    }
    await save();
    renderSoon();
}
async function pool(domains, size, label) {
    let done = 0;
    const list = [...domains];
    const worker = async () => {
        while (list.length) {
            const d = list.shift();
            await refreshDomain(d, { quiet: true });
            setStatus(`${label} ${++done}/${domains.length}…`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(size, list.length) }, worker));
    setStatus(`${label} finished — ${domains.length} website(s) updated.`);
}
async function addSite(url, kind, preset = {}) {
    const u = parseUrlInput(url);
    if (!u)
        throw new Error("That does not look like a valid website address.");
    const resolved = kind === "auto" ? (detectProfile(u.href) ? "profile" : "site") : kind;
    setStatus(`Fetching ${u.hostname}…`);
    if (resolved === "profile") {
        const pr = await fetchProfileBundle(u.href);
        const r = applyProfile(data, pr);
        await save();
        currentView = "profiles";
        render();
        setStatus(`${r.isNew ? "Added" : "Updated"} profile ${pr.name} (${pr.platform}) · ${pr.category}.`);
        return;
    }
    const b = await fetchSiteBundle(u.href, { kind: resolved, presetName: preset.name, presetCountry: preset.country });
    const r = applyBundle(data, b, { kind: resolved });
    // Keep learning-site metadata on the existing website profile; no second site database is created.
    if (Object.prototype.hasOwnProperty.call(preset, "languageLearning")) {
        r.site.languageLearning = preset.languageLearning === true;
        r.site.learningLanguage = preset.learningLanguage || "en";
        if (preset.category) {
            r.site.category = preset.category;
            r.site.categoryLocked = true;
            r.site.autoCategory = false;
        }
    }
    if (preset.name)
        lib().websiteData[b.domain].presetName = preset.name;
    if (preset.country)
        lib().websiteData[b.domain].presetCountry = preset.country;
    await save();
    currentView = preset.languageLearning ? "learning-language" : (resolved === "news" ? "news" : "websites");
    catFilter = "All";
    countryFilter = "All";
    render();
    setStatus(`${r.isNew ? "Added" : "Updated"} ${b.title} → ${r.site.category}. ${b.categoryReason}${b.blocked ? " (The website blocks full page access, so only basic data was found.)" : ""}`);
}
async function addCurrentTab() {
    const tab = await lastWebTab();
    if (!tab) {
        openAddDialog("No open web page was found in your other tabs. Paste the website address instead.");
        return;
    }
    const kind = currentView === "news" ? "news" : currentView === "profiles" ? "profile" : "auto";
    const learningPreset = currentView === "learning-language"
        ? { languageLearning: true, learningLanguage: data.languageLearning?.settings?.targetLanguage || "en" }
        : {};
    await addSite(tab.url, kind, learningPreset);
    const u = new URL(tab.url); // also keep the article itself when the tab is an article page
    if (u.pathname.length > 1 && !detectProfile(tab.url) && kind === "auto") {
        try {
            let art = null;
            try {
                const r = await chrome.tabs.sendMessage(tab.id, { type: "CMJ_GET_PAGE_DATA" });
                if (r?.ok)
                    art = r.article;
            }
            catch { /* no content script on this tab */ }
            if (art) {
                if (!(data.articles || []).some((a) => a.url === art.url)) {
                    const siteProfile = findSite(data, u.hostname);
                    data.articles.unshift({
                        ...art,
                        id: crypto.randomUUID(),
                        languageLearning: siteProfile?.languageLearning === true,
                        language: siteProfile?.learningLanguage || "en",
                        category: siteProfile?.category || "General",
                        savedAt: new Date().toISOString(),
                        status: "unread",
                        progress: 0
                    });
                    await save();
                }
            }
            else {
                await save();
                await saveArticleFromUrl(tab.url, findSite(data, u.hostname)?.category);
                await reloadArticles();
            }
            setStatus(`${$("view-status").textContent} Article saved too.`);
            render();
        }
        catch { /* article capture is optional */ }
    }
}
async function updateSite(domain, key, value) {
    let s = findSite(data, domain);
    if (!s) {
        s = { domain, version: 1, enabled: true, tags: [] };
        data.settings.websites.push(s);
    }
    if (key === "tags")
        value = String(value).split(",").map((x) => x.trim()).filter(Boolean);
    s[key] = value;
    s.version = (s.version || 1) + 1;
    s.updatedAt = new Date().toISOString();
    if (key === "category") {
        s.categoryLocked = true;
        s.autoCategory = false;
        if (lib().websiteData[domain])
            lib().websiteData[domain].category = value;
    }
    await save();
    render();
}
function openAddDialog(message = "") {
    $("add-msg").textContent = message;
    $("add-learning-site").checked = currentView === "learning-language";
    $("add-category").value = "";
    $("add-language").value = "en";
    $("add-language-custom").value = "";
    $("add-url").value = "";
    $("add-kind").value = currentView === "news" ? "news" : currentView === "profiles" ? "profile" : "auto";
    $("add-dialog").showModal();
    $("add-url").focus();
}
/* ---------- events ---------- */
/** Number of items shown by the active tab, read from its own header ("12 of 40 website(s)") or its cards. */
function visibleItemCount() {
    const meta = document.querySelector("#library-view .section-head .meta");
    const match = meta?.textContent.match(/^\s*(\d[\d,]*)/);
    return match ? Number(match[1].replace(/,/g, "")) : document.querySelectorAll("#library-view .card, #library-view article.article").length;
}
let refreshing = false;
/**
 * Re-read storage and re-render only the active tab. Search text, category and
 * country filters, expanded cards and the scroll position are all kept, and
 * nothing is reloaded.
 * @param {{silent?: boolean}} [options] `silent` skips the spinner and message (used by auto-refresh).
 */
async function refreshFromStorage({ silent = false } = {}) {
    if (refreshing) return;
    refreshing = true;
    const button = $("reload-library");
    if (!silent) { button.classList.add("is-loading"); button.disabled = true; setStatus("Refreshing…"); }
    const scrollers = [document.scrollingElement, document.querySelector(".workspace"), $("library-view")].filter(Boolean);
    const positions = scrollers.map((element) => element.scrollTop);
    try {
        await queue;                                   // let pending saves land first
        const fresh = await getAll();
        for (const key of Object.keys(fresh)) data[key] = fresh[key];
        libraryOf(data);
        baseline = snapshot();
        render();
        if (detail && detail.type !== "article" && $("detail").open && !busyDetail) renderDetail();
        scrollers.forEach((element, index) => { element.scrollTop = positions[index]; });
        if (!silent) setStatus(`Refreshed · ${visibleItemCount()} item(s)`);
    } catch (error) {
        setStatus(`Refresh failed: ${error.message}`, true);
    } finally {
        refreshing = false;
        button.classList.remove("is-loading");
        button.disabled = false;
    }
}
$("reload-library").onclick = () => refreshFromStorage();

/** Auto-refresh: sites and articles saved elsewhere appear without clicking anything. */
let autoRefreshTimer = 0;
globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local" || Date.now() < ignoreStorageEventsUntil) return;
    if (!LIBRARY_KEYS.some((key) => key in changes) && !("bookmarks" in changes)) return;
    clearTimeout(autoRefreshTimer);
    autoRefreshTimer = setTimeout(() => {
        // Never re-render under an open dialog or while the user is typing in a form field.
        const typing = document.activeElement?.matches?.("textarea, select, input:not(#search)");
        if (document.querySelector("dialog[open]") || typing) return;
        refreshFromStorage({ silent: true });
    }, 400);
});
$("side-nav").onclick = (e) => {
    const b = e.target.closest("[data-view]");
    if (b) {
        currentView = b.dataset.view;
        render();
    }
};
$("search").oninput = render;
$("hints").onclick = (e) => {
    const h = e.target.closest("[data-hint]");
    if (h) {
        $("search").value = h.dataset.hint;
        render();
    }
};
$("add").onclick = () => addCurrentTab().catch((e) => setStatus(e.message, true));
$("add-url-btn").onclick = () => openAddDialog();
$("refresh").onclick = () => {
    const view = allWebsites().filter((x) => (currentView === "news" ? isNews(x) : !isNews(x)));
    pool(view.map((x) => x.domain), 3, "Refreshing").catch((e) => setStatus(e.message, true));
};
$("export").onclick = () => download("my-reading-library.json", { ...lib(), websites: sites() });
$("import").onclick = () => $("file").click();
$("file").onchange = async (e) => {
    try {
        const v = JSON.parse(await e.target.files[0].text());
        if (Array.isArray(v)) {
            let n = 0;
            for (const it of v)
                if (it.domain && !findSite(data, it.domain)) {
                    data.settings.websites.push(it);
                    n++;
                }
            setStatus(`Imported ${n} website(s). Fetching their data…`);
            await save();
            render();
            pool(v.map((i) => i.domain).filter(Boolean), 3, "Fetching logos & data");
            e.target.value = "";
            return;
        }
        if (v.categories || v.websiteData) {
            const l = lib();
            data.readingLibrary = {
                ...l,
                ...v,
                favorites: [...new Set([...l.favorites, ...(v.favorites || [])])],
                profiles: [...(v.profiles || []), ...l.profiles.filter((p) => !(v.profiles || []).some((q) => q.id === p.id))]
            };
            for (const it of v.websites || [])
                if (it.domain && !findSite(data, it.domain))
                    data.settings.websites.push(it);
        }
        else if (v.category)
            lib().categories[v.category] = v.items || [];
        else
            throw Error("Unsupported library JSON.");
        await save();
        render();
        setStatus("Library imported successfully.");
    }
    catch (err) {
        setStatus(err.message, true);
    }
    e.target.value = "";
};
$("open-options").onclick = () => chrome.runtime.openOptionsPage();
$("open-adapters").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html#adapters") });
$("add-cancel").onclick = () => $("add-dialog").close();
$("add-tab").onclick = async () => {
    const t = await lastWebTab();
    if (t) {
        $("add-url").value = t.url;
        $("add-msg").textContent = "";
    }
    else
        $("add-msg").textContent = "No open web page found in your other tabs.";
};
$("add-form").onsubmit = async (e) => {
    e.preventDefault();
    const url = $("add-url").value, selectedKind = $("add-kind").value;
    const kind = selectedKind === "learning-language" ? "site" : selectedKind;
    const languageLearning = $("add-learning-site").checked || selectedKind === "learning-language";
    const learningLanguage = $("add-language-custom").value.trim() || $("add-language").value;
    const category = $("add-category").value || "";
    $("add-dialog").close();
    try {
        await addSite(url, kind, { languageLearning, learningLanguage, category });
    }
    catch (err) {
        setStatus(err.message, true);
    }
};
$("detail-close").onclick = () => $("detail").close();
$("detail").addEventListener("close", () => { detail = null; });
$("detail-tabs").onclick = (e) => {
    const b = e.target.closest("[data-dtab]");
    if (b && detail) {
        detail.tab = b.dataset.dtab;
        renderDetail();
    }
};
document.addEventListener("submit", async (e) => {
    const f = e.target.closest("[data-form]");
    if (!f)
        return;
    e.preventDefault();
    const url = f.elements.url.value.trim();
    if (!url)
        return;
    try {
        await addSite(url, { site: "site", news: "news", profile: "profile" }[f.dataset.form]);
    }
    catch (err) {
        setStatus(err.message, true);
    }
});
document.addEventListener("change", async (e) => {
    const ac = e.target.closest("[data-article-cat]");
    if (ac) {
        const a = data.articles.find((x) => x.id === ac.dataset.articleCat);
        if (a) {
            a.category = ac.value;
            a.categoryLocked = true;
            a.categoryReason = "Manually selected in Saved Articles.";
            const l = lib();
            for (const [c, items] of Object.entries(l.categories))
                l.categories[c] = (items || []).filter(x => x.id !== a.id);
            l.categories[a.category] = [a, ...(l.categories[a.category] || [])];
            await save();
            render();
            renderDetail();
        }
        return;
    }
    const c = e.target;
    if (c.dataset.siteKey) {
        await updateSite(c.dataset.domain, c.dataset.siteKey, c.type === "checkbox" ? c.checked : c.value);
        return;
    }
    if (c.dataset.actChange === "cat") {
        await updateSite(c.dataset.d, "category", c.value);
        renderDetail();
    }
    if (c.dataset.actChange === "country") {
        const m = (lib().websiteData[c.dataset.d] ||= { domain: c.dataset.d });
        m.country = c.value.trim() || "Global";
        m.countryLocked = true;
        await save();
        render();
    }
});
document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-bookmarks-export]")) {
        downloadTextFile("charlie-mj-bookmarks.json", JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), bookmarks: data.bookmarks || [] }, null, 2), "application/json");
        return;
    }
    if (e.target.closest("[data-bookmarks-import]")) {
        $("bookmarks-import-file")?.click();
        return;
    }
    if (e.target.closest("[data-bookmark-remove]")) {
        const id = e.target.closest("[data-bookmark-remove]").dataset.bookmarkRemove;
        data.bookmarks = (data.bookmarks || []).filter((item) => String(item.id) !== id);
        await save(); render();
        return;
    }
    if (e.target.closest("[data-bookmark-open]")) {
        const url = e.target.closest("[data-bookmark-open]").dataset.bookmarkOpen;
        if (url) chrome.tabs.create({ url });
        return;
    }
    if (e.target.closest("[data-add-learning-website]")) {
        const dialog = $("add-dialog");
        $("add-kind").value = "learning-language";
        $("add-learning-site").checked = true;
        $("add-msg").textContent = "This website will be added to the Learning Language collection.";
        dialog.showModal();
        return;
    }
    if (e.target.closest("[data-act=detail-cat]")) {
        const categoryName = e.target.closest("[data-act=detail-cat]").dataset.d;
        const categorySites = allWebsites().filter((site) => categoryOf(site) === categoryName);
        const categoryArticles = (data.articles || []).filter((article) => (article.category || "General") === categoryName);
        $("detail-head").innerHTML = `<h2>${esc(categoryName)}</h2><p>${categorySites.length} websites · ${categoryArticles.length} saved articles</p>`;
        $("detail-body").innerHTML = `<div class="detail-grid">${categorySites.map(site => `<div class="detail-item"><strong>${esc(site.domain)}</strong><span>${esc(site.meta?.title || "Website")}</span></div>`).join("")}${categoryArticles.map(article => `<div class="detail-item"><strong>${esc(article.title || "Untitled")}</strong><span>${esc(article.url || "")}</span></div>`).join("")}</div>`;
        $("detail").showModal();
        return;
    }
    if (e.target.closest("[data-open-learning]")) {
        chrome.tabs.create({ url: chrome.runtime.getURL("src/language-learning/language-learning.html") });
        return;
    }
    if (e.target.closest("[data-learning-details]")) {
        openDetail("learning-article", e.target.closest("[data-learning-details]").dataset.learningDetails);
        return;
    }
    if (e.target.closest("[data-open-learning-article]")) {
        const articleId = e.target.closest("[data-open-learning-article]").dataset.openLearningArticle;
        chrome.tabs.create({ url: chrome.runtime.getURL(`src/language-learning/language-learning.html?article=${encodeURIComponent(articleId)}`) });
        return;
    }
    if (e.target.closest("[data-refresh-learning-article]")) {
        const article = data.articles.find((item) => item.id === e.target.closest("[data-refresh-learning-article]").dataset.refreshLearningArticle);
        if (article?.url) {
            await saveArticleFromUrl(article.url, article.category || "General");
            await reloadArticles();
            render();
            setStatus("Article metadata refreshed using the existing Reader fetch engine.");
        }
        return;
    }
    if (e.target.closest("[data-export-learning-csv]")) {
        const rows = [["title", "url", "domain", "author", "language", "savedAt"], ...(data.articles || []).filter((article) => article.languageLearning === true || (data.settings.websites || []).some((site) => site.languageLearning && stripWww(site.domain) === stripWww(article.domain || ""))).map((article) => [article.title, article.url, article.domain, article.author, article.languageName || article.language, article.savedAt])];
        const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
        downloadTextFile("charlie-mj-learning-articles.csv", csv, "text/csv;charset=utf-8");
        return;
    }
    if (e.target.closest("[data-export-learning-md]")) {
        const articles = (data.articles || []).filter((article) => article.languageLearning === true || (data.settings.websites || []).some((site) => site.languageLearning && stripWww(site.domain) === stripWww(article.domain || "")));
        const markdown = articles.map((article) => `# ${article.title || "Untitled article"}\n\n- Source: ${article.url || ""}\n- Author: ${article.author || "Unknown"}\n- Language: ${article.languageName || article.language || "Unspecified"}\n\n${article.text || ""}`).join("\n\n---\n\n");
        downloadTextFile("charlie-mj-learning-articles.md", markdown, "text/markdown;charset=utf-8");
        return;
    }
    const chip = e.target.closest("[data-cat],[data-country]");
    if (chip) {
        if (chip.dataset.cat)
            catFilter = chip.dataset.cat;
        if (chip.dataset.country)
            countryFilter = chip.dataset.country;
        render();
        return;
    }
    const pre = e.target.closest("[data-preset]");
    if (pre) {
        try {
            await addSite(pre.dataset.preset, "news", { name: pre.dataset.name, country: pre.dataset.country });
        }
        catch (err) {
            setStatus(err.message, true);
        }
        return;
    }
    const b = e.target.closest("[data-act]");
    if (!b)
        return;
    const d = b.dataset.d, act = b.dataset.act, label = b.textContent;
    try {
        if (act === "add-cat") {
            const name = prompt("New category name:");
            if (name && name.trim()) {
                data.settings.libraryCustomCategories = [...new Set([...(data.settings.libraryCustomCategories || []), name.trim()])];
                await save(); render();
            }
        }
        else if (act === "edit-cat") {
            const oldName = d;
            const nextName = prompt("Rename category:", oldName);
            if (nextName && nextName.trim() && nextName.trim() !== oldName) {
                const clean = nextName.trim();
                data.settings.libraryCustomCategories = (data.settings.libraryCustomCategories || []).map(value => value === oldName ? clean : value);
                for (const site of data.settings.websites || []) if (categoryOf(site) === oldName) site.category = clean;
                for (const article of data.articles || []) if ((article.category || "General") === oldName) article.category = clean;
                await save(); render();
            }
        }
        else if (act === "remove-cat") {
            if (confirm(`Remove category “${d}”? Existing records will be moved to General.`)) {
                data.settings.libraryCustomCategories = (data.settings.libraryCustomCategories || []).filter(value => value !== d);
                for (const site of data.settings.websites || []) if (categoryOf(site) === d) site.category = "General";
                for (const article of data.articles || []) if ((article.category || "General") === d) article.category = "General";
                await save(); render();
            }
        }
        else if (act === "add-tag") {
            const tag = prompt("New tag:");
            if (tag && tag.trim()) {
                data.settings.libraryCustomTags = [...new Set([...(data.settings.libraryCustomTags || []), tag.trim()])];
                await save(); render();
            }
        }
        else if (act === "edit-tag") {
            const nextTag = prompt("Rename tag:", d);
            if (nextTag && nextTag.trim()) {
                const clean = nextTag.trim();
                for (const site of data.settings.websites || []) site.tags = (site.tags || []).map(tag => tag === d ? clean : tag);
                for (const article of data.articles || []) { article.tags = (article.tags || []).map(tag => tag === d ? clean : tag); article.labels = (article.labels || []).map(tag => tag === d ? clean : tag); }
                await save(); render();
            }
        }
        else if (act === "remove-tag") {
            if (confirm(`Remove tag “${d}” from all records?`)) {
                for (const site of data.settings.websites || []) site.tags = (site.tags || []).filter(tag => tag !== d);
                for (const article of data.articles || []) { article.tags = (article.tags || []).filter(tag => tag !== d); article.labels = (article.labels || []).filter(tag => tag !== d); }
                data.settings.libraryCustomTags = (data.settings.libraryCustomTags || []).filter(tag => tag !== d);
                await save(); render();
            }
        }
        else if (act === "fav") {
            const f = lib().favorites;
            lib().favorites = f.includes(d) ? f.filter((x) => x !== d) : [...f, d];
            await save();
            render();
        }
        else if (act === "expand") {
            expanded[d] = !expanded[d];
            render();
        }
        else if (act === "detail")
            openDetail("site", d);
        else if (act === "detail-p")
            openDetail("profile", d);
        else if (act === "article-detail")
            openDetail("savedArticle", d);
        else if (act === "refresh") {
            setStatus(`Refreshing ${d}…`);
            await refreshDomain(d);
        }
        else if (act === "refresh-p") {
            const old = lib().profiles.find((p) => p.id === d);
            setStatus(`Refreshing ${old.name}…`);
            applyProfile(data, await fetchProfileBundle(old.url));
            await save();
            render();
            setStatus(`Updated ${old.name}.`);
        }
        else if (act === "open-site")
            chrome.tabs.create({ url: lib().websiteData[d]?.url || `https://${d}` });
        else if (act === "open-p")
            chrome.tabs.create({ url: lib().profiles.find((p) => p.id === d)?.url });
        else if (act === "dl-site")
            download(`${d.replace(/[^a-z0-9]+/gi, "-")}.json`, { website: lib().websiteData[d] || {}, settings: findSite(data, d), articles: data.articles.filter((a) => stripWww(a.domain) === stripWww(d)) });
        else if (act === "rm-site") {
            data.settings.websites = (data.settings.websites || []).filter((x) => stripWww(siteProfile(x).domain) !== stripWww(d));
            delete lib().websiteData[d];
            await save();
            render();
            setStatus(`${d} removed. Saved articles remain available.`);
        }
        else if (act === "rm-p") {
            lib().profiles = lib().profiles.filter((p) => p.id !== d);
            await save();
            render();
        }
        else if (act === "read")
            chrome.tabs.create({ url: chrome.runtime.getURL(`src/reader/reader.html?articleId=${encodeURIComponent(d)}#reader`) });
        else if (act === "dl-article") {
            const a = data.articles.find((x) => x.id === d);
            if (a)
                download(`${(a.title || "article").replace(/[^a-z0-9]+/gi, "-")}.json`, a);
        }
        else if (act === "rm-article") {
            data.articles = (data.articles || []).filter((x) => x.id !== d);
            await save();
            render();
        }
        else if (act === "dl-cat")
            download(`${d.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`, {
                version: 3,
                category: d,
                websites: allWebsites().filter((x) => categoryOf(x) === d).map((x) => ({ site: x.site, data: x.meta })),
                items: lib().categories[d] || []
            });
        else if (act === "open-cat") {
            catFilter = d;
            currentView = "websites";
            render();
        }
        else if (act === "tag") {
            $("search").value = d;
            currentView = "all";
            render();
        }
        else if (act === "seo-article") {
            const a = data.articles.find((x) => x.id === d);
            openArticleSeo(a.url);
        }
        else if (act === "seo-item")
            openArticleSeo(lib().websiteData[d].latest[+b.dataset.n].link);
        else if (act === "seo-pitem")
            openArticleSeo(lib().profiles.find((p) => p.id === d).latest[+b.dataset.n].link);
        else if (act === "seo-pick-run") {
            const u = $("seo-pick").value;
            if (u)
                auditUrl(u);
        }
        else if (act === "save-item" || act === "save-pitem") {
            const item = act === "save-item" ? lib().websiteData[d].latest[+b.dataset.n] : lib().profiles.find((p) => p.id === d).latest[+b.dataset.n];
            b.textContent = "Saving…";
            b.disabled = true;
            const a = await saveArticleFromUrl(item.link, act === "save-item" ? categoryOf(allWebsites().find((s) => s.domain === d)) : "");
            await reloadArticles();
            b.textContent = "Saved ✓";
            setStatus(`Saved “${a.title}”.`);
            render();
        }
        else if (act === "google-saved") {
            const a = data.articles.find((x) => x.id === d);
            if (!a)
                return;
            b.disabled = true;
            b.textContent = "Running Google audit…";
            try {
                a.google = await runGoogleAudit(a.url, b.dataset.s || "mobile");
                a.googleError = "";
                await save();
            }
            catch (e) {
                a.googleError = e.message;
                await save();
            }
            b.disabled = false;
            b.textContent = "Refresh Google SEO";
            renderDetail();
        }
        else if (act === "google" || act === "google-url") {
            const url = act === "google" ? lib().websiteData[d]?.url || `https://${d}` : b.dataset.u;
            b.disabled = true;
            b.textContent = "Running Google audit… (up to a minute)";
            busyDetail = true;
            let g;
            try {
                g = await runGoogleAudit(url, b.dataset.s);
            }
            finally {
                busyDetail = false;
            }
            if (act === "google") {
                const m = lib().websiteData[d];
                m.google = { ...(m.google || {}), [b.dataset.s]: g };
            }
            else {
                const r = lib().seoPages?.[url] || detail?.result;
                if (r) {
                    r.google = g;
                    (lib().seoPages ||= {})[r.url] = r;
                }
                if (detail?.type === "article")
                    detail.result = r;
            }
            await save();
            renderDetail();
        }
        else if (act === "copy-raw") {
            await navigator.clipboard.writeText($("raw-json").textContent);
            setStatus("Raw data copied.");
        }
        else if (act === "dl-raw")
            download(`${String(detail.key || "data").replace(/[^a-z0-9]+/gi, "-")}.json`, JSON.parse($("raw-json").textContent));
    }
    catch (err) {
        setStatus(err.message || "Action failed.", true);
        b.disabled = false;
        b.textContent = label;
    }
});
/** Populate Add-to-Library language choices from the bundled ISO 639 registry. */
async function populateAddWebsiteLanguages() {
    const select = $("add-language");
    if (!select) return;
    try {
        const response = await fetch(chrome.runtime.getURL("database/languages.json"));
        if (!response.ok) throw new Error("Language registry unavailable.");
        const registry = await response.json();
        const current = select.value || "en";
        select.innerHTML = registry.languages.map((language) => {
            const code = language.alpha2 || language.alpha3;
            return `<option value="${esc(code)}" ${code === current ? "selected" : ""}>${esc(language.name)} (${esc(code)})</option>`;
        }).join("");
    } catch (error) {
        console.warn("Charlie MJ Reader: language registry could not be loaded.", error);
    }
}

$("library-view").addEventListener("change", async (event) => {
    if (event.target.id !== "bookmarks-import-file") return;
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        const payload = JSON.parse(await file.text());
        if (!Array.isArray(payload.bookmarks)) throw new Error("This file does not contain a bookmarks array.");
        const known = new Set((data.bookmarks || []).map((item) => item.id));
        data.bookmarks = [...(data.bookmarks || []), ...payload.bookmarks.filter((item) => item && !known.has(item.id))];
        await save(); render(); setStatus("Bookmarks imported successfully.");
    } catch (error) { setStatus(error.message || "Bookmark import failed.", true); }
    event.target.value = "";
});

render();
populateAddWebsiteLanguages();
// First run / newly imported list: fetch logos and data in the background, 3 websites at a time.
const pending = allWebsites().filter((x) => !x.meta.fetchedAt).map((x) => x.domain);
if (pending.length)
    pool(pending, 3, "Fetching logos & data").catch((e) => setStatus(e.message, true));
// Consistent bottom-corner feedback for library action buttons.
document.addEventListener("click", event => {
    const b = event.target.closest("button");
    if (!b)
        return;
    const n = data?.settings?.notifications || {};
    if (n.enabled === false || n.events?.action === false)
        return;
    let host = document.getElementById("cmj-library-toast-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "cmj-library-toast-host";
        document.body.append(host);
    }
    host.dataset.position = ["top-left", "top-right", "bottom-left", "bottom-right"].includes(n.position) ? n.position : "bottom-right";
    const t = document.createElement("div");
    t.className = "cmj-options-toast";
    t.textContent = `${(b.textContent || "Action").trim().replace(/\s+/g, " ").slice(0, 48)} clicked`;
    host.append(t);
    setTimeout(() => t.remove(), Number(n.durationMs || 2600));
}, { capture: true });
