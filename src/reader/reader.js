import { getAll, saveAll, makeId } from "../lib/storage.js";
import { exportArticle, exportBackup, downloadText } from "../lib/export.js";

const view = document.getElementById("view");
const title = document.getElementById("page-title");
let data = await getAll();
data.categories = Array.isArray(data.categories) ? data.categories : [];
let route = location.hash.slice(1) || "dashboard";
let activeArticle = null;
let activeUtterance = null;
let activeWordCount = 0;
let currentWord = 0;
let audioState = "idle";
let audioSentences = [];
let sentenceIndex = 0;
let wordTimer = null;
let fallbackWord = 0;
let wordTimerStartedAt = 0;
let audioSettings = { speed: data.settings?.ttsRate || 1, pitch: data.settings?.ttsPitch || 1, volume: 1, highlightMode: data.settings?.audioHighlightMode || "combined", autoScroll: data.settings?.audioAutoScroll !== false, mouseFollow: data.settings?.readerMouseFollow !== false, focusMode: false, smartPause: false, sleepMinutes: 0, voiceURI: data.settings?.audioVoiceURI || "" };
let sleepTimer = null;
let readingStartedAt = 0;
let playbackStarted = false;
let completionHandled = false;
let progressSaveTimer = null;
let elapsedReadingMs = 0;
let currentBookmark = null;
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const save = async () => { await saveAll(data); };
function toast(message, event="article", tone="ok") {
  const settings=data.settings?.notifications||{}; const events=settings.events||{};
  if(settings.enabled===false || events[event]===false) return;
  let host=document.getElementById("cmj-toast-host");
  if(!host){ host=document.createElement("div"); host.id="cmj-toast-host"; document.body.append(host); }
  host.dataset.position = ["top-left","top-right","bottom-left","bottom-right"].includes(settings.position) ? settings.position : "bottom-right";
  const el=document.createElement("div"); el.className=`cmj-toast cmj-toast-${tone}`; el.textContent=message; host.append(el);
  setTimeout(()=>el.remove(), Number(settings.durationMs||2600));
}
function markBusy(button,label="Working…") { if(!button) return ()=>{}; const old=button.innerHTML; button.disabled=true; button.classList.add("is-active"); button.innerHTML=label; return (text)=>{button.disabled=false;button.classList.remove("is-active");button.innerHTML=text||old;}; }


// Use an extension-owned confirmation dialog instead of browser-native dialogs.
// Native confirm() can be suppressed when the extension page is not the active tab.
function askConfirmation(message, title = "Charlie MJ Reader") {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "cmj-confirm-overlay";
    overlay.innerHTML = `<section class="cmj-confirm-card" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3><p>${esc(message).replace(/\n/g, "<br>")}</p><div class="cmj-confirm-actions"><button type="button" data-choice="cancel">Cancel</button><button type="button" data-choice="ok">Continue</button></div></section>`;
    const finish = value => { overlay.remove(); resolve(value); };
    overlay.addEventListener("click", event => {
      if (event.target === overlay) finish(false);
      const choice = event.target.closest("[data-choice]")?.dataset.choice;
      if (choice) finish(choice === "ok");
    });
    document.body.append(overlay);
    overlay.querySelector('[data-choice="ok"]')?.focus();
  });
}
const btn = (label, action, id="") => `<button data-action="${action}" data-id="${id}">${label}</button>`;
function render() {
  data = data || {};
  const search = document.getElementById("global-search").value.toLowerCase();
  const articles = data.articles.filter(a => !search || `${a.title} ${a.text} ${a.author}`.toLowerCase().includes(search));
  const counts = [
    ["Saved articles",data.articles.length],["Highlights",data.highlights.length],
    ["Vocabulary",data.vocabulary.length],["Personal notes",data.notes.length]
  ];
  const nav = {analytics:"Reading analytics",dashboard:"Your reading dashboard",reader:"Reader Workspace",media:"Productivity Reader","article-library":"Article Library",library:"My Reading Library",bookmarks:"Bookmarks",highlights:"Highlights",vocabulary:"Vocabulary builder",quotes:"Quotes",paragraphs:"Saved paragraphs",notes:"Personal notes",collections:"Collections",history:"Reading history",exports:"Export center"};
  title.textContent = nav[route] || nav.dashboard;
  document.querySelectorAll(".sidebar nav a").forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${route}`));
  if (route === "media" && !activeArticle) {
    view.innerHTML = `<div class="media-welcome card"><span class="eyebrow">CHARLIE MJ · SMART AUDIO</span><h2>Productivity Reader</h2><p>Choose an article and press Read. Your media controls, synchronized text, progress and reading tools will appear here in the main workspace.</p><div class="media-empty-state"><span class="media-empty-icon">♫</span><strong>No article is currently playing</strong><span>Start reading from your Article Library below.</span></div></div><div class="section-head"><h2>Ready to read</h2><button class="btn" data-route="library">Open full library →</button></div>${articleList(articles.slice(0,8))}`;
  } else if (route==="analytics") {
    const completed = data.articles.filter(a => a.status === "completed");
    const seconds = data.articles.reduce((n,a) => n + (a.listenedSeconds || 0), 0);
    const words = data.articles.reduce((n,a) => n + Math.round((a.wordCount || 0) * (a.progress || 0) / 100), 0);
    view.innerHTML = `<div class="grid"><div class="stat"><b>${completed.length}</b><span>Completed articles</span></div><div class="stat"><b>${Math.round(seconds/60)}</b><span>Tracked audio minutes</span></div><div class="stat"><b>${words.toLocaleString()}</b><span>Words progressed through</span></div><div class="stat"><b>${data.readingHistory.length}</b><span>Reading sessions</span></div></div><div class="card"><h3>Article progress</h3>${articleList(data.articles.slice().sort((a,b)=>(b.progress||0)-(a.progress||0)))}</div>`;
  } else if (route==="dashboard") {
    view.innerHTML = `<div class="hero"><span class="eyebrow">WELCOME BACK</span><h2>Read smarter. Learn deeper.</h2><p>Turn articles into ideas you can find, revisit and use. Your saved content stays in this browser unless you export it.</p><button class="btn" data-action="capture">＋ Save current tab</button> <button class="btn" data-action="new-note">Create a note</button></div><div class="grid">${counts.map(([n,v])=>`<div class="stat"><b>${v}</b><span>${n}</span></div>`).join("")}</div><div class="section-head"><h2>Recently saved articles</h2><button class="btn" data-route="library">View library →</button></div>${articleList(articles.slice(0,5))}`;
  } else if (route==="reader") {
    view.innerHTML = `<div class="toolbar"><button data-action="capture">Capture current page</button><button data-action="listen-page">Listen to current page</button><button data-action="stop-audio">Stop audio</button></div><div class="card"><h3>Reader workspace</h3><p>Use “Capture current page” to save accessible article text from the active tab. Open a saved article below to read it in a distraction-free view.</p></div>${articleList(articles)}`;
  } else if (route==="article-library") {
    view.innerHTML = `<div class="toolbar"><button data-action="capture">＋ Save current tab</button><button data-action="refresh-library">↻ Refresh</button><button data-action="backup">Export</button><button data-action="import">Import</button><button data-action="download-articles">Download JSON</button><select id="article-sort"><option value="modified">Recently modified</option><option value="saved">Recently saved</option><option value="title">Title</option><option value="progress">Progress</option></select><input id="article-filter" placeholder="Search articles, sites, authors…"></div><div class="card"><p class="muted">Article Library is linked to <b>My Reading Library → Saved Articles</b>. Each card is the same saved article record, not a second copy.</p></div>${articleCards(articles)}`;
  } else if (route==="library" || route==="history") {
    view.innerHTML = `<div class="toolbar"><button data-action="capture">＋ Save current tab</button><button data-action="backup">Export full backup</button><button data-action="import">Import backup</button><input id="import-file" type="file" accept="application/json" hidden></div>${articleList(route==="history" ? data.readingHistory : articles)}`;
  } else if (route==="bookmarks") {
    view.innerHTML = `<div class="card"><h3>Reading position bookmarks</h3><p>Bookmarks restore the exact article and word position whenever the saved article is opened.</p></div>${genericList(data.bookmarks,"No bookmarks yet.","bookmark")}`;
  } else if (route==="quotes") {
    view.innerHTML = `<div class="toolbar"><button data-action="export-captures">Export captures</button></div>${genericList(data.quotes,"No quotes yet.","quote")}`;
  } else if (route==="paragraphs") {
    view.innerHTML = `${genericList(data.paragraphs,"No saved paragraphs yet.","paragraph")}${genericList(data.selections,"No custom selections yet.","selection")}`;
  } else if (route==="highlights") {
    view.innerHTML = `<div class="toolbar"><button data-action="capture-highlight">Highlight selected text on active tab</button></div>${genericList(data.highlights,"No highlights yet.","highlight")}`;
  } else if (route==="vocabulary") {
    const categories = data.categories || [];
    const vocabSearch = document.getElementById("global-search").value.trim().toLocaleLowerCase();
    const filteredWords = data.vocabulary.filter(w => !vocabSearch ||
      [w.word,w.translation,w.definition,w.example,w.notes,w.source,...(w.tags||[])].join(" ").toLocaleLowerCase().includes(vocabSearch));
    const categoryOptions = categories.map(c => `<option value="${esc(c.id)}">${"— ".repeat(c.level||0)}${esc(c.name)}</option>`).join("");
    const categoryTree = categories.length ? categories.map(c => `<span class="cmj-category-chip">${"· ".repeat(c.level||0)}${esc(c.name)} <small>${data.vocabulary.filter(w=>w.categoryId===c.id).length}</small><button data-action="edit-category" data-id="${esc(c.id)}" title="Edit category">✎</button><button data-action="delete-category" data-id="${esc(c.id)}" title="Delete category">×</button></span>`).join("") : `<span class="muted">No categories yet. Create your first heading.</span>`;
    view.innerHTML = `<div class="toolbar"><button data-action="add-category">＋ Add heading / subheading</button><button data-action="quiz">Practice review</button><button data-action="export-vocabulary-md">Markdown</button><button data-action="export-vocabulary-csv">CSV</button><button data-action="export-vocabulary-json">JSON</button></div>
      <div class="card cmj-vocab-composer"><h3>Add vocabulary entry</h3><p class="help">The original text is displayed in bold and its translation in regular weight. Save a word, phrase or complete sentence.</p>
      <form id="vocab-entry-form" class="cmj-vocab-form">
        <label>Original text <input name="word" required maxlength="1800" placeholder="Turkish word or expression"></label>
        <label>Translation <input name="translation" placeholder="English translation"></label>
        <label>Definition <textarea name="definition" rows="2" placeholder="Contextual meaning"></textarea></label>
        <label>Category / subcategory <select name="categoryId"><option value="">Uncategorized</option>${categoryOptions}</select></label>
        <label>Example sentence <textarea name="example" rows="2" placeholder="Example in Turkish"></textarea></label>
        <label>Example translation <textarea name="exampleTranslation" rows="2" placeholder="Translated example"></textarea></label>
        <label>Pronunciation <input name="pronunciation" placeholder="Optional pronunciation guide"></label>
        <label>Part of speech <input name="partOfSpeech" placeholder="Noun, verb, adjective…"></label>
        <label>Synonyms <input name="synonyms" placeholder="Related words or expressions"></label>
        <label>Tags <input name="tags" placeholder="slang, daily-life, idiom"></label>
        <label>Personal notes <textarea name="notes" rows="2" placeholder="Your own notes"></textarea></label>
        <button class="btn" type="submit">Save to Vocabulary Library</button>
      </form></div>
      <div class="card cmj-vocab-categories"><div class="section-head"><h3>Categories & subcategories</h3><span>${categories.length} headings</span></div><div class="cmj-category-list">${categoryTree}</div></div>
      <div class="section-head"><h2>Vocabulary library</h2><span>${filteredWords.length} entries</span></div>
      ${filteredWords.length ? `<div class="list">${filteredWords.map(w=>`<article class="item cmj-vocab-item"><div class="cmj-vocab-copy"><h3 class="cmj-vocab-original-text">${esc(w.word)}</h3><p class="cmj-vocab-translation-text">${esc(w.translation||"Translation not added yet")}</p>${w.definition?`<p>${esc(w.definition)}</p>`:""}${w.synonyms?`<p><b>Synonyms:</b> ${esc(w.synonyms)}</p>`:""}${w.example?`<p><b>Example:</b> ${esc(w.example)}</p>`:""}${w.exampleTranslation?`<p class="cmj-vocab-translation-text">${esc(w.exampleTranslation)}</p>`:""}${w.notes?`<p><b>Notes:</b> ${esc(w.notes)}</p>`:""}<p class="muted">${esc(categories.find(c=>c.id===w.categoryId)?.name||"Uncategorized")} · ${esc(w.source||"Manual")} · ${esc(w.status||"new")}</p></div><div class="item-actions"><button data-action="edit-vocab" data-id="${esc(w.id)}">Edit</button><button data-action="copy-vocab" data-id="${esc(w.id)}">Copy</button><button data-action="mark-mastered" data-id="${esc(w.id)}">Mastered</button><button data-action="delete-word" data-id="${esc(w.id)}">Delete</button></div></article>`).join("")}</div>` : `<div class="empty">No vocabulary entries match your search. Add a word or select text on a supported website.</div>`}`;
  } else if (route==="notes") {
    view.innerHTML = `<div class="toolbar"><button data-action="new-note">＋ New note</button></div>${genericList(data.notes,"No notes yet.","note")}`;
  } else if (route==="collections") {
    view.innerHTML = `<div class="toolbar"><button data-action="new-collection">＋ New collection</button></div>${genericList(data.collections,"No collections yet.","collection")}`;
  } else if (route==="exports") {
    view.innerHTML = `<div class="cards"><div class="card"><h3>Full library backup</h3><p>Export all local records and settings to a portable JSON file.</p><button class="btn" data-action="backup">Download backup</button></div><div class="card"><h3>Article exports</h3><p>Save individual articles as Markdown, TXT, HTML or JSON.</p>${articleList(data.articles)}</div><div class="card"><h3>Highlights export</h3><p>Download all saved highlights as Markdown.</p><button class="btn" data-action="export-highlights">Export highlights</button></div></div>`;
  } else {
    view.innerHTML = `<div class="empty">Choose a section from the sidebar.</div>`;
  }
}
function articleCard(a){ const progress=Math.round(a.progress||0); const thumb=a.image||a.thumbnail||""; const logo=a.siteLogo||a.favicon||""; return `<article class="article-card"><div class="article-card-media">${thumb?`<img src="${esc(thumb)}" loading="lazy">`:`<div class="article-placeholder">▤</div>`}</div><div class="article-card-body"><div class="article-card-site">${logo?`<img src="${esc(logo)}">`:""}<span>${esc(a.siteName||a.domain||"Website")}</span></div><h3 class="article-title-link" data-action="read" data-id="${esc(a.id)}">${esc(a.title||"Untitled article")}</h3><p>${esc(a.description||a.subtitle||((a.text||"").slice(0,180)))}</p><p class="muted">${esc(a.author||"")} · ${a.wordCount||0} words · ${a.readingMinutes||1} min</p><div class="article-meta"><span>Saved ${esc((a.savedAt||a.createdAt||"").slice(0,10))}</span><span>Modified ${esc((a.updatedAt||a.modifiedAt||a.savedAt||"").slice(0,10))}</span><span>${progress}%</span></div><div class="progress-track"><span style="width:${progress}%"></span></div></div><div class="item-actions"><button data-action="fetch-article" data-id="${esc(a.id)}">↻ Refresh & Fetch</button><button data-action="read" data-id="${esc(a.id)}">Read Yourself</button><button data-action="listen" data-id="${esc(a.id)}">Listen</button><button data-action="see-saved" data-id="${esc(a.id)}">See Saved</button><button data-action="details-article" data-id="${esc(a.id)}">Details</button><button data-action="edit-article" data-id="${esc(a.id)}">Edit</button><button data-action="delete-article" data-id="${esc(a.id)}">Remove</button></div></article>`; }
function articleCards(items){ if(!items?.length) return `<div class="empty">No articles match your search.</div>`; return `<div class="article-grid">${items.map(articleCard).join("")}</div>`; }
function articleList(items) { if (!items?.length) return `<div class="empty">Nothing here yet. Save an article to get started.</div>`; return `<div class="article-grid">${items.map(articleCard).join("")}</div>`; }
function genericList(items,empty,type) { if (!items?.length) return `<div class="empty">${empty}</div>`; return `<div class="list">${items.map(item=>`<article class="item"><div><h3>${esc(item.title||item.word||item.text||"Saved item")}</h3><p>${esc(item.text||item.definition||item.note||"")}</p><p>${esc(item.siteName||item.domain||"")} · ${esc(item.url||item.createdAt||"")}</p></div><div class="item-actions">${item.articleId?btn("Open article","read",item.articleId):""}${btn("Delete",`delete-${type}`,item.id)}</div></article>`).join("")}</div>`; }
async function captureActive() {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  const [{result}] = await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
    const candidates=[...document.querySelectorAll("article,main,[role='main'],.post-content,.article-content,.entry-content,.story-content")];
    const main=candidates.sort((a,b)=>(b.innerText?.length||0)-(a.innerText?.length||0))[0]||document.body;
    const clone=main.cloneNode(true); clone.querySelectorAll("script,style,noscript,nav,header,footer,aside,form,[aria-hidden='true']").forEach(el=>el.remove());
    const text=(clone.innerText||main.innerText||"").replace(/\n{3,}/g,"\n\n").trim();
    const html=clone.innerHTML||"";
    const wordCount=text.split(/\s+/).filter(Boolean).length;
    return {id:crypto.randomUUID(),title:document.querySelector('meta[property="og:title"]')?.content||document.querySelector("h1")?.innerText||document.title,url:location.href,domain:location.hostname,text,html,canonicalUrl:document.querySelector('link[rel="canonical"]')?.href||location.href,siteName:document.querySelector('meta[property="og:site_name"]')?.content||location.hostname,author:document.querySelector('meta[name="author"]')?.content||"",image:document.querySelector('meta[property="og:image"]')?.content||"",description:document.querySelector('meta[name="description"]')?.content||document.querySelector('meta[property="og:description"]')?.content||"",tags:[...document.querySelectorAll('meta[property="article:tag"],meta[name="keywords"]')].flatMap(x=>(x.content||"").split(',')).map(x=>x.trim()).filter(Boolean),labels:[...document.querySelectorAll('[rel="tag"],.tag,.tags a')].map(x=>x.textContent.trim()).filter(Boolean),wordCount,readingMinutes:Math.max(1,Math.ceil(wordCount/220)),savedAt:new Date().toISOString(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:"unread",progress:0,readingPosition:{word:0,percent:0}};
  }});
  if (!result.text?.trim()) throw new Error("No readable article text found on this page.");
  if (!data.articles.some(a=>a.url===result.url)) data.articles.unshift(result);
  else { const existing=data.articles.find(a=>a.url===result.url); Object.assign(existing,result,{id:existing.id,createdAt:existing.createdAt||result.createdAt,updatedAt:new Date().toISOString()}); }
  await save(); toast("✓ Article saved","article"); render();
}
function splitSentences(text) {
  // Keep punctuation with each sentence; this provides reliable utterance boundaries.
  return (String(text || "").match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || []).map(s => s.trim()).filter(Boolean);
}
function sanitizeArticleHTML(raw, baseUrl = location.href) {
  if (!raw) return "";
  // Strip SVG/MathML blocks and inline event attributes before parsing. The
  // parsed document is inert, but pre-filtering also prevents hostile markup
  // from reaching any later DOM insertion path.
  const source = String(raw)
    .replace(/<(svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:src|href)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "");
  const parsed = new DOMParser().parseFromString(source, "text/html");
  const allowed = new Set(["ARTICLE","SECTION","DIV","P","H1","H2","H3","H4","H5","H6","UL","OL","LI","BLOCKQUOTE","PRE","CODE","TABLE","THEAD","TBODY","TR","TH","TD","A","IMG","FIGURE","FIGCAPTION","STRONG","B","EM","I","U","S","BR","HR","DL","DT","DD","SPAN"]);
  const blocked = new Set(["SCRIPT","STYLE","NOSCRIPT","IFRAME","OBJECT","EMBED","FORM","INPUT","BUTTON","VIDEO","AUDIO","SOURCE","TRACK","SVG","MATH","FOREIGNOBJECT","CANVAS"]);
  const safeUrl = value => { try { const u = new URL(value, baseUrl); return ["https:","http:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
  // Rebuild from a strict element/attribute allowlist; never copy inline handlers or SVG.
  const copyNode = node => {
    if (node.nodeType === Node.TEXT_NODE) return parsed.createTextNode(node.nodeValue || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return parsed.createDocumentFragment();
    const tag = node.tagName.toUpperCase().split(":").pop();
    if (node.namespaceURI === "http://www.w3.org/2000/svg" || node.namespaceURI === "http://www.w3.org/1998/Math/MathML" || blocked.has(tag)) return parsed.createDocumentFragment();
    const children = [...node.childNodes].map(copyNode);
    if (!allowed.has(tag)) { const frag = parsed.createDocumentFragment(); children.forEach(child => frag.append(child)); return frag; }
    const clean = parsed.createElement(tag.toLowerCase());
    if (tag === "A") { const href = safeUrl(node.getAttribute("href")); if (href) { clean.setAttribute("href", href); clean.setAttribute("target", "_blank"); clean.setAttribute("rel", "noopener noreferrer"); } }
    if (tag === "IMG") { const src = safeUrl(node.getAttribute("src")); if (!src) return parsed.createDocumentFragment(); clean.setAttribute("src", src); clean.setAttribute("loading", "lazy"); clean.setAttribute("referrerpolicy", "no-referrer"); const alt=node.getAttribute("alt"); if(alt) clean.setAttribute("alt",alt.slice(0,500)); }
    if ((tag === "TH" || tag === "TD") && /^[1-9]$|^10$/.test(node.getAttribute("colspan")||"")) clean.setAttribute("colspan",node.getAttribute("colspan"));
    children.forEach(child => clean.append(child)); return clean;
  };
  const holder = parsed.createElement("div");
  [...parsed.body.childNodes].forEach(node => holder.append(copyNode(node)));
  return holder.innerHTML;
}
function buildStructuredReadingMarkup(article) {
  const html = sanitizeArticleHTML(article.html || "", article.contentBaseUrl || article.url || location.href);
  if (!html) return buildReadingMarkup(article.text || "");
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  let global=0;
  const sentences=[];
  const textNodes=[];
  const walker=doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while(walker.nextNode()) textNodes.push(walker.currentNode);
  for (const node of textNodes) {
    const parent=node.parentElement;
    if (!parent || ["SCRIPT","STYLE"].includes(parent.tagName)) continue;
    const parts=(node.nodeValue||"").split(/(\s+)/);
    const frag=doc.createDocumentFragment();
    for(const part of parts){
      if (!part) continue;
      if (/^\s+$/.test(part)) frag.append(doc.createTextNode(part));
      else { const span=doc.createElement("span"); span.className="cmj-word"; span.dataset.word=String(global++); span.textContent=part; frag.append(span); }
    }
    node.replaceWith(frag);
  }
  activeWordCount=global;
  root.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre").forEach((el,i)=>el.dataset.cmjBlock=String(i));
  // Build the speech sentence index from the article's actual readable text.
  // Previously structured HTML populated word spans but left audioSentences
  // empty, so clicking Listen immediately called finishReading().
  const speechText = String(article.text || root.textContent || "").replace(/\s+/g, " ").trim();
  let firstWord = 0;
  audioSentences = splitSentences(speechText).map((sentence, index) => {
    const words = sentence.match(/\S+/g) || [];
    const item = { text: sentence, words, firstWord, index };
    firstWord += words.length;
    return item;
  });
  activeWordCount = firstWord;
  return root.innerHTML;
}
function buildReadingMarkup(text) {
  let global = 0;
  audioSentences = splitSentences(text).map((sentence, index) => {
    const words = sentence.match(/\S+/g) || [];
    const firstWord = global;
    const markup = sentence.split(/(\s+)/).map(part => {
      if (/^\s+$/.test(part)) return esc(part);
      const wordIndex = global++;
      return `<span class="cmj-word" data-word="${wordIndex}">${esc(part)}</span>`;
    }).join("");
    return { text: sentence, words, firstWord, markup, index };
  });
  activeWordCount = global;
  return audioSentences.map(s => `<p class="cmj-sentence" data-sentence="${s.index}">${s.markup}</p>`).join("");
}
let captureType = "selection";
function openRead(article, autoplay = false) {
  if (!article) return;
  route = "media";
  if (location.hash !== "#media") location.hash = "media";
  speechSynthesis.cancel(); clearInterval(wordTimer); clearTimeout(sleepTimer);
  activeArticle = article;
  playbackStarted = false; completionHandled = false; readingStartedAt = 0;
  activeWordCount = article.wordCount || (article.text || "").split(/\s+/).filter(Boolean).length;
  currentWord = Math.max(0, Math.min(activeWordCount, Number.isFinite(article.currentWord) ? article.currentWord : Math.floor((article.progress || 0) * activeWordCount / 100)));
  if(currentWord>0) toast(`↻ Reading position restored (${Math.round(currentWord/Math.max(1,activeWordCount)*100)}%)`,"restored");
  sentenceIndex = 0;
  audioState = "idle";
  const readingMarkup = buildStructuredReadingMarkup(article);
  const tocDoc = new DOMParser().parseFromString(`<div>${sanitizeArticleHTML(article.html||"", article.url||location.href)}</div>`, "text/html");
  const toc = [...tocDoc.body.querySelectorAll("h1,h2,h3,h4")].map((h,i)=>({id:`cmj-heading-${i}`,level:Number(h.tagName.slice(1)),text:h.textContent.trim()})).filter(x=>x.text);
  sentenceIndex = audioSentences.findIndex(s => currentWord >= s.firstWord && currentWord < s.firstWord + s.words.length);
  if (sentenceIndex < 0) sentenceIndex = 0;
  data.readingHistory.unshift({...article,openedAt:new Date().toISOString()});
  data.readingHistory = data.readingHistory.slice(0, 500);
  save();
  view.innerHTML = `<div class="toolbar"><button data-action="back">← Back</button><button data-action="reader-close">Close Productivity Reader</button><button data-action="md" data-id="${esc(article.id)}">Export Markdown</button><label>Aa <input id="reader-font" type="range" min="14" max="30" value="${data.settings.fontSize||18}"></label><label>Width <input id="reader-width" type="range" min="520" max="1100" value="${data.settings.readingWidth||760}"></label><label>Line <input id="reader-line" type="range" min="1.2" max="2.4" step=".1" value="${data.settings.lineHeight||1.75}"></label><label>Theme <select id="reader-theme"><option value="default-dark">Dark</option><option value="pure-white">Light</option><option value="sepia">Sepia</option></select></label></div>
    <section class="media-toolbar card" id="smart-media-toolbar" aria-label="Smart reading media controls">
      <div class="media-head"><strong>CHARLIE MJ — SMART AUDIO READER</strong><span id="audio-status">Ready</span></div>
      <div class="media-head muted"><span id="audio-percent">${Math.round(article.progress||0)}% complete</span><span id="audio-position">${currentWord} / ${activeWordCount} words</span></div>
      <div class="progress-track"><span id="audio-progress" style="width:${article.progress||0}%"></span></div>
      <div class="media-controls"><button data-action="media-play">▶ Play / Resume</button><button data-action="media-pause">Ⅱ Pause</button><button data-action="media-stop">■ Stop</button><button data-action="previous-sentence">↶ Sentence</button><button data-action="next-sentence">Sentence ↷</button></div>
      <div class="audio-options"><label>Speed <select id="audio-speed"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1.0×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2.0×</option><option value="2.5">2.5×</option></select></label>
      <label>Voice <select id="audio-voice"><option value="">System default</option></select></label>
      <label>Highlight <select id="highlight-mode"><option value="combined">Word + sentence</option><option value="word">Word only</option><option value="sentence">Sentence only</option></select></label>
      <label><input type="checkbox" id="auto-scroll" checked> Auto-scroll</label><label><input type="checkbox" id="focus-mode"> Focus mode</label><label><input type="checkbox" id="smart-pause"> Pause after sentence</label><label><input type="checkbox" id="auto-next-article"> Play next saved article</label>
      <label>Sleep timer <select id="sleep-timer"><option value="0">Off</option><option value="10">10 min</option><option value="20">20 min</option><option value="30">30 min</option><option value="60">60 min</option></select></label>
      <button data-action="bookmark-word">☆ Bookmark position</button><button data-action="repeat-word">↻ Repeat word</button></div>
    </section>
    <article class="card reading-article" id="reading-article"><span class="eyebrow">${esc(article.siteName||article.domain||"ARTICLE")}</span><h2>${esc(article.title)}</h2><p class="muted">${esc(article.author||"")} · ${article.publishedAt?esc(new Date(article.publishedAt).toLocaleDateString()):""} · ${article.readingMinutes||1} min read</p>${article.image?`<img class="reader-featured-image" src="${esc(article.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:""}${article.description?`<p class="reader-dek">${esc(article.description)}</p>`:""}${toc.length?`<nav class="reader-toc card" aria-label="Table of contents"><strong>Contents</strong>${toc.map(x=>`<a href="#${x.id}" style="margin-left:${Math.max(0,x.level-1)*14}px">${esc(x.text)}</a>`).join("")}</nav>`:""}<div class="reading-content">${readingMarkup}</div></article>`;
  // Focused two-column workspace: article + one right-hand Productivity Toolbar.
  // All reader controls live in the right rail; no duplicate in-reader left rail.
  const player = document.getElementById("smart-media-toolbar"), articleNode = document.getElementById("reading-article");
  if (player && articleNode) {
    const layout=document.createElement("div"); layout.className="cmj-productivity-layout cmj-productivity-layout-single-rail";
    const center=document.createElement("div"); center.className="cmj-reader-center";
    const right=document.createElement("aside"); right.className="cmj-reader-rail cmj-reader-right";
    right.innerHTML=`<div class="cmj-rail-heading">PRODUCTIVITY TOOLBAR</div>
      <div class="cmj-now-reading"><span class="cmj-live-dot"></span> NOW READING</div><b id="cmj-rail-title"></b>
      <div class="cmj-rail-heading">AUDIO READER</div><div id="cmj-audio-controls"></div>
      <div class="cmj-rail-divider"></div><div class="cmj-rail-heading">SAVE & ANNOTATE</div>
      <button data-action="bookmark-word">☆ Save reading position</button><button data-action="annotate-position">✎ Add note at position</button>
      <button data-action="workspace-capture" data-kind="vocabulary">＋ Save selected word</button><button data-action="workspace-capture" data-kind="quote">❝ Save quote</button>
      <button data-action="workspace-capture" data-kind="paragraph">¶ Save paragraph</button><button data-action="workspace-capture" data-kind="selection">▤ Save selection</button>
      <div class="cmj-rail-divider"></div><div class="cmj-rail-heading">READING PROGRESS</div><div class="cmj-rail-progress"><span id="cmj-rail-progress-fill"></span></div>
      <small id="cmj-rail-progress-label">${Math.round(article.progress||0)}% completed</small>
      <div class="cmj-rail-divider"></div><div class="cmj-rail-heading">QUICK SETTINGS</div>
      <label class="cmj-rail-label">Theme<select id="rail-reader-theme"><option value="default-dark">Dark</option><option value="pure-white">Light</option><option value="sepia">Sepia</option></select></label>
      <label class="cmj-rail-label">Text size<input id="rail-reader-font" type="range" min="14" max="30" value="${data.settings.fontSize||18}"></label>
      <label class="cmj-rail-check"><input id="rail-focus-mode" type="checkbox"> Focus mode</label>
      <div class="cmj-rail-divider"></div><div class="cmj-rail-heading">IN THIS ARTICLE</div><nav id="cmj-reader-outline" class="cmj-reader-outline"></nav>`;
    player.before(layout); layout.append(center,right); center.append(articleNode);
    right.querySelector("#cmj-audio-controls").append(player);
    right.querySelector("#cmj-rail-title").textContent=article.title||"Untitled article";
    right.querySelector("#rail-reader-theme").value=data.settings.readingTheme||"default-dark";
    right.querySelector("#rail-focus-mode").checked=audioSettings.focusMode;
    const outline=right.querySelector("#cmj-reader-outline");
    toc.forEach((item,index)=>{const link=document.createElement("a");link.href=`#cmj-heading-${index}`;link.textContent=item.text;link.style.paddingLeft=`${Math.max(0,item.level-1)*10}px`;link.addEventListener("click",ev=>{ev.preventDefault();articleNode.querySelector(`#cmj-heading-${index}`)?.scrollIntoView({behavior:"smooth",block:"start"});});outline.append(link);});
    right.querySelector("#rail-reader-theme").addEventListener("change",ev=>{data.settings.readingTheme=ev.target.value;articleNode.setAttribute("data-reading-theme",ev.target.value);const mainTheme=document.getElementById("reader-theme");if(mainTheme)mainTheme.value=ev.target.value;save();});
    right.querySelector("#rail-reader-font").addEventListener("input",ev=>{data.settings.fontSize=Number(ev.target.value);articleNode.style.setProperty("--reader-font-size",`${ev.target.value}px`);const mainFont=document.getElementById("reader-font");if(mainFont)mainFont.value=ev.target.value;save();});
    right.querySelector("#rail-focus-mode").addEventListener("change",ev=>{audioSettings.focusMode=ev.target.checked;const mainFocus=document.getElementById("focus-mode");if(mainFocus)mainFocus.checked=ev.target.checked;updateAudioProgress(currentWord,audioState);});
  }
  const readingRoot = document.getElementById("reading-article");
  readingRoot?.querySelectorAll(".reading-content h1,.reading-content h2,.reading-content h3,.reading-content h4")?.forEach((h,i)=>{ h.id=`cmj-heading-${i}`; });
  readingRoot?.addEventListener("mousemove", e => {
    if (!audioSettings.mouseFollow) return;
    const word = e.target.closest?.(".cmj-word");
    if (!word) return;
    readingRoot.querySelectorAll(".cmj-pointer-word").forEach(x=>x.classList.remove("cmj-pointer-word"));
    readingRoot.querySelectorAll(".cmj-pointer-line").forEach(x=>x.classList.remove("cmj-pointer-line"));
    word.classList.add("cmj-pointer-word");
    const block = word.closest("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre");
    block?.classList.add("cmj-pointer-line");
  });
  readingRoot?.addEventListener("mouseleave", () => {
    readingRoot.querySelectorAll(".cmj-pointer-word,.cmj-pointer-line").forEach(x=>x.classList.remove("cmj-pointer-word","cmj-pointer-line"));
  });
  title.textContent = "Productivity Reader";
  document.querySelectorAll(".sidebar nav a").forEach(link => link.classList.toggle("active", link.getAttribute("href") === "#media"));
  document.getElementById("highlight-mode").value = audioSettings.highlightMode;
  document.getElementById("auto-scroll").checked = audioSettings.autoScroll;
  document.getElementById("focus-mode").checked = audioSettings.focusMode;
  document.getElementById("smart-pause").checked = audioSettings.smartPause;
  populateVoices();
  updateAudioProgress(currentWord, "idle");
  if (autoplay) playArticleAudio();
}

const initialArticleId = new URLSearchParams(location.search).get("articleId");
function populateVoices() {
  const select = document.getElementById("audio-voice"); if (!select) return;
  const selected = audioSettings.voiceURI || "";
  const voices = speechSynthesis.getVoices();
  select.innerHTML = `<option value="">System default</option>` + voices.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join("");
  select.value = selected;
}
speechSynthesis.addEventListener?.("voiceschanged", populateVoices);
function updateAudioProgress(word, status = audioState) {
  if (!activeArticle) return;
  currentWord = Math.max(0, Math.min(activeWordCount, word));
  const percent = activeWordCount ? Math.round(currentWord / activeWordCount * 100) : 0;
  activeArticle.progress = percent;
  activeArticle.currentWord = currentWord;
  activeArticle.status = percent >= 100 ? "completed" : percent > 0 ? "in-progress" : "unread";
  const bar = document.getElementById("audio-progress"); if (bar) bar.style.width = `${percent}%`;
  const railBar=document.getElementById("cmj-rail-progress-fill"); if(railBar) railBar.style.width=`${percent}%`;
  const railLabel=document.getElementById("cmj-rail-progress-label"); if(railLabel) railLabel.textContent=`${percent}% completed`;
  const pct = document.getElementById("audio-percent"); if (pct) pct.textContent = `${percent}% complete`;
  const pos = document.getElementById("audio-position"); if (pos) pos.textContent = `${currentWord} / ${activeWordCount} words`;
  const label = document.getElementById("audio-status"); if (label) label.textContent = status === "playing" ? "Playing" : status === "paused" ? "Paused" : status === "stopped" ? "Stopped" : "Ready";
  document.querySelectorAll(".cmj-word.active-word").forEach(el => el.classList.remove("active-word"));
  document.querySelectorAll(".cmj-sentence.active-sentence").forEach(el => el.classList.remove("active-sentence"));
  const wordEl = document.querySelector(`.cmj-word[data-word="${currentWord}"]`);
  const sentenceEl = wordEl?.closest(".cmj-sentence") || wordEl?.closest("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre");
  if (audioSettings.highlightMode !== "sentence") wordEl?.classList.add("active-word");
  if (audioSettings.highlightMode !== "word") sentenceEl?.classList.add("active-sentence");
  if (wordEl && audioSettings.autoScroll && status === "playing") wordEl.scrollIntoView({behavior:"smooth",block:"center"});
  document.getElementById("reading-article")?.classList.toggle("focus-active", audioSettings.focusMode && status === "playing");
  clearTimeout(progressSaveTimer);
  progressSaveTimer = setTimeout(() => save(), 900);
}
function stopWordFallback() { if (wordTimer) clearInterval(wordTimer); wordTimer = null; }
function startWordFallback(sentenceEnd) {
  stopWordFallback();
  fallbackWord = currentWord;
  const msPerWord = Math.max(150, 390 / (audioSettings.speed || 1));
  wordTimer = setInterval(() => {
    if (audioState !== "playing") return;
    fallbackWord = Math.min(sentenceEnd - 1, fallbackWord + 1);
    updateAudioProgress(fallbackWord, "playing");
  }, msPerWord);
}
function speakCurrentSentence() {
  if (!activeArticle || sentenceIndex >= audioSentences.length) { finishReading(); return; }
  const sentence = audioSentences[sentenceIndex];
  const utteranceStartWord = currentWord;
  fallbackWord = utteranceStartWord;
  const sentenceEnd = sentence.firstWord + sentence.words.length;
  if (currentWord < sentence.firstWord || currentWord >= sentenceEnd) currentWord = sentence.firstWord;
  const offset = currentWord - sentence.firstWord;
  const text = sentence.words.slice(offset).join(" ");
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const voice = voices.find(v => v.voiceURI === audioSettings.voiceURI);
  if (voice) utterance.voice = voice;
  utterance.rate = audioSettings.speed || 1; utterance.pitch = audioSettings.pitch || 1; utterance.volume = audioSettings.volume ?? 1;
  let boundarySeen = false;
  utterance.onstart = () => {
    audioState = "playing"; updateAudioProgress(currentWord, audioState);
    // Some OS voices omit word-boundary events. Estimate word timing per sentence as a fallback.
    startWordFallback(sentenceEnd);
  };
  utterance.onboundary = event => {
    if (event.name !== "word") return;
    boundarySeen = true; stopWordFallback();
    const local = text.slice(0, event.charIndex).trim().split(/\s+/).filter(Boolean).length;
    updateAudioProgress(Math.min(sentenceEnd - 1, utteranceStartWord + local), "playing");
  };
  utterance.onend = () => {
    stopWordFallback();
    if (audioState !== "playing") return;
    currentWord = sentenceEnd; updateAudioProgress(currentWord, "playing");
    sentenceIndex++;
    if (audioSettings.smartPause) { audioState = "paused"; updateAudioProgress(currentWord, "paused"); return; }
    speakCurrentSentence();
  };
  utterance.onerror = event => { stopWordFallback(); if (event.error !== "canceled" && event.error !== "interrupted") { audioState = "stopped"; updateAudioProgress(currentWord, "stopped"); } };
  activeUtterance = utterance; speechSynthesis.speak(utterance);
}
function playArticleAudio() {
  if (!activeArticle?.text || !audioSentences.length) return;
  if (audioState === "paused" && speechSynthesis.paused) { speechSynthesis.resume(); audioState = "playing"; const sentence = audioSentences[sentenceIndex]; if (sentence) startWordFallback(sentence.firstWord + sentence.words.length); updateAudioProgress(currentWord, audioState); return; }
  if (audioState === "paused" && audioSettings.smartPause) { audioState = "playing"; speakCurrentSentence(); return; }
  if (audioState === "playing") return;
  if (currentWord >= activeWordCount) currentWord = 0;
  sentenceIndex = Math.max(0, audioSentences.findIndex(s => currentWord >= s.firstWord && currentWord < s.firstWord + s.words.length));
  audioState = "playing";
  if (!readingStartedAt) readingStartedAt = Date.now();
  playbackStarted = true;
  const sleep = Number(document.getElementById("sleep-timer")?.value || 0);
  if (sleep) { clearTimeout(sleepTimer); sleepTimer = setTimeout(() => stopArticleAudio(), sleep * 60000); }
  speakCurrentSentence();
}
async function finishReading() {
  if (!activeArticle || !playbackStarted || completionHandled) return;
  completionHandled = true;
  stopWordFallback(); audioState = "stopped"; updateAudioProgress(activeWordCount, "stopped");
  if (activeArticle) {
    activeArticle.completedAt = new Date().toISOString();
    activeArticle.listenedSeconds = Math.round((Date.now() - readingStartedAt) / 1000);
    save();
    if (await askConfirmation("Article completed! Would you like to save a reading completion certificate?", "Reading completed")) {
      downloadText(`reading-certificate-${Date.now()}.txt`, `CHARLIE MJ READER\nREADING COMPLETION\n\nArticle: ${activeArticle.title}\nCompleted: ${new Date().toLocaleString()}\nWords: ${activeWordCount}\nTracked listening: ${activeArticle.listenedSeconds || 0} seconds\n\nThis is a personal reading record, not an accredited certificate.`);
    }
    if (document.getElementById("auto-next-article")?.checked) {
      const next = data.articles.find(a => a.id !== activeArticle.id && (a.progress || 0) < 100);
      if (next) openRead(next, true);
    }
  }
}
function stopArticleAudio() { speechSynthesis.cancel(); stopWordFallback(); clearTimeout(sleepTimer); audioState = "stopped"; currentWord = 0; sentenceIndex = 0; updateAudioProgress(0, "stopped"); clearTimeout(progressSaveTimer); save(); }
function jumpSentence(direction) {
  if (!audioSentences.length) return;
  speechSynthesis.cancel(); stopWordFallback();
  sentenceIndex = Math.max(0, Math.min(audioSentences.length - 1, sentenceIndex + direction));
  currentWord = audioSentences[sentenceIndex].firstWord; audioState = "paused"; updateAudioProgress(currentWord, "paused");
}
function savePositionNote() {
  const word = audioSentences[sentenceIndex]?.words[Math.max(0, currentWord - (audioSentences[sentenceIndex]?.firstWord || 0))] || "";
  const overlay=document.createElement("div"); overlay.className="cmj-confirm-overlay";
  overlay.innerHTML=`<section class="cmj-confirm-card cmj-note-dialog" role="dialog" aria-modal="true" aria-labelledby="cmj-note-title"><h3 id="cmj-note-title">Add note at reading position</h3><p>Save a note at word ${currentWord}${word?` (${esc(word)})`:""} in this article.</p><textarea id="cmj-position-note" rows="5" placeholder="Write your note…"></textarea><div class="cmj-confirm-actions"><button type="button" data-choice="cancel">Cancel</button><button type="button" data-choice="save">Save note</button></div></section>`;
  const field=overlay.querySelector("#cmj-position-note");
  overlay.addEventListener("click",async event=>{if(event.target===overlay||event.target.closest('[data-choice="cancel"]')){overlay.remove();return;}if(event.target.closest('[data-choice="save"]')){const note=field.value.trim();if(!note){field.focus();field.setAttribute("aria-invalid","true");return;}data.notes.unshift({id:makeId(),title:`Note at word ${currentWord}`,text:note,note,articleId:activeArticle?.id,position:currentWord,createdAt:new Date().toISOString()});await save();overlay.remove();toast("Note saved at this position","article");}});
  document.body.append(overlay);field.focus();
}
document.addEventListener("click",async e=>{
  const spokenWord = e.target.closest?.(".cmj-word");
  if (spokenWord && activeArticle) {
    const word = spokenWord.textContent.replace(/[^\p{L}'-]/gu, "").trim();
    if (word) {
      try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        const entries = response.ok ? await response.json() : [];
        const meaning = entries?.[0]?.meanings?.[0]?.definitions?.[0]?.definition || "Meaning not available from the dictionary service.";
        if (await askConfirmation(`${word}\n\n${meaning}\n\nSave this word to Vocabulary?`, "Save vocabulary")) {
          data.vocabulary.unshift({id:makeId(),word,definition:meaning,sourceArticleId:activeArticle.id,url:activeArticle.url,createdAt:new Date().toISOString(),status:"learning"});
          await save(); alert("Word saved to Vocabulary.");
        }
      } catch { if (await askConfirmation(`Save “${word}” to Vocabulary?`, "Save vocabulary")) { data.vocabulary.unshift({id:makeId(),word,sourceArticleId:activeArticle.id,createdAt:new Date().toISOString(),status:"learning"}); await save(); } }
    }
    return;
  }
  const routeTarget=e.target.closest("[data-route]"); if(routeTarget){location.hash=routeTarget.dataset.route;return;}
  const target=e.target.closest("[data-action]"); if(!target)return;
  const action=target.dataset.action,id=target.dataset.id;
  try {
    if(action==="capture") await captureActive();
    if(action==="listen-page"){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>speechSynthesis.speak(new SpeechSynthesisUtterance((document.querySelector("article,main")||document.body).innerText.slice(0,12000)))});}
    if(action==="stop-audio") speechSynthesis.cancel();
    if(action==="read") openRead(data.articles.find(a=>a.id===id), false);
    if(action==="back") render();
    if(action==="listen"){
      const article = data.articles.find((item)=>item.id===id);
      if (article) { if (activeArticle?.id !== article.id) openRead(article, true); else playArticleAudio(); }
    }
    if(action==="media-play") playArticleAudio();
    if(action==="media-pause") { if(speechSynthesis.speaking && !speechSynthesis.paused){speechSynthesis.pause();audioState="paused";stopWordFallback();updateAudioProgress(currentWord,audioState);} }
    if(action==="media-stop") stopArticleAudio();
    if(action==="reader-close"){speechSynthesis.cancel();stopWordFallback();activeArticle=null;route="media";location.hash="media";render();}
    if(action==="previous-sentence") jumpSentence(-1);
    if(action==="next-sentence") jumpSentence(1);
    if(action==="bookmark-word"){data.bookmarks.unshift({id:makeId(),articleId:activeArticle?.id,title:activeArticle?.title,position:currentWord,percent:Math.round(currentWord/Math.max(1,activeWordCount)*100),createdAt:new Date().toISOString()});await save();toast("✓ Reading position bookmarked","bookmark");}
    if(action==="annotate-position") savePositionNote();
    if(action==="fetch-article"){
      const article=data.articles.find(x=>x.id===id); if(!article) throw new Error("Article not found.");
      const sourceUrl=article.canonicalUrl||article.url; if(!sourceUrl) throw new Error("This saved article has no source URL.");
      const tabs=await chrome.tabs.query({});
      const samePage=t=>{try{const a=new URL(t.url),b=new URL(sourceUrl);return a.href===b.href||(a.origin+a.pathname.replace(/\/$/,"")===b.origin+b.pathname.replace(/\/$/,""));}catch{return false;}};
      const tab=tabs.find(t=>t.url&&samePage(t));
      if(!tab?.id) throw new Error("Open this article on its original website in a browser tab, then press Refresh & Fetch again.");
      const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
        const meta=(...selectors)=>{for(const sel of selectors){const el=document.querySelector(sel);const v=el?.content||el?.href||el?.getAttribute("datetime")||"";if(v.trim())return v.trim();}return "";};
        const candidates=[...document.querySelectorAll("article,main,[role=main],.post-content,.article-content,.entry-content,.story-content")];
        const main=candidates.sort((a,b)=>(b.innerText?.length||0)-(a.innerText?.length||0))[0]||document.body;
        const clone=main.cloneNode(true);clone.querySelectorAll("script,style,noscript,nav,header,footer,aside,form,[aria-hidden=true],[role=navigation]").forEach(n=>n.remove());
        const text=(clone.innerText||main.innerText||"").replace(/\n{3,}/g,"\n\n").trim();
        const image=meta('meta[property="og:image"]','meta[name="twitter:image"]','meta[property="og:image:secure_url"]')||document.querySelector("article img,main img")?.currentSrc||document.querySelector("article img,main img")?.src||"";
        const title=meta('meta[property="og:title"]','meta[name="twitter:title"]')||document.querySelector("h1")?.innerText?.trim()||document.title;
        const subtitle=meta('meta[property="og:description"]','meta[name="description"]','meta[name="twitter:description"]')||document.querySelector(".subtitle,.dek,.article-subtitle,[class*=subtitle],[class*=dek]")?.innerText?.trim()||"";
        const canonical=meta('link[rel="canonical"]')||location.href;
        return {title,originalTitle:title,subtitle,description:subtitle,image,thumbnail:image,author:meta('meta[name="author"]','meta[property="article:author"]'),publishedAt:meta('meta[property="article:published_time"]','meta[name="date"]','time[datetime]'),siteName:meta('meta[property="og:site_name"]')||location.hostname,canonicalUrl:canonical,url:location.href,text,html:clone.innerHTML,wordCount:text.split(/\s+/).filter(Boolean).length,fetchedAt:new Date().toISOString()};
      }});
      if(!result?.text) throw new Error("The source page did not expose readable article content.");
      Object.assign(article,result,{updatedAt:new Date().toISOString(),readingMinutes:Math.max(1,Math.ceil(result.wordCount/220))}); await save(); render(); toast("Article details, subtitle and thumbnail refreshed","article");
    }
    if(action==="see-saved"){ chrome.tabs.create({url:chrome.runtime.getURL(`src/reader/saved.html?articleId=${encodeURIComponent(id)}`)}); }
    if(action==="repeat-word"){const sentence=audioSentences[sentenceIndex];const word=sentence?.words[Math.max(0,currentWord-sentence.firstWord)];if(word){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(word);u.rate=audioSettings.speed;speechSynthesis.speak(u);}}

    if(["md","txt"].includes(action)){const a=data.articles.find(x=>x.id===id);if(a)exportArticle(a,action);}
    if(action==="delete-article"){const a=data.articles.find(x=>x.id===id);if(a)data.deleted.unshift({...a,deletedAt:new Date().toISOString()});data.articles=data.articles.filter(x=>x.id!==id);await save();render();}
    if(action==="backup")exportBackup(data);
    if(action==="import"){
      const importInput = document.getElementById("import-file");
      if (importInput) importInput.click();
      else throw new Error("The backup import control is not available on this page. Open My Library and try again.");
    }
    if(action==="export-highlights")downloadText("charlie-mj-highlights.md",data.highlights.map(h=>`> ${h.text}\n\nSource: ${h.url||""}`).join("\n\n---\n\n"));
    if(action==="capture-highlight"){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>getSelection().toString()});if(result){data.highlights.unshift({id:makeId(),text:result,url:tab.url,createdAt:new Date().toISOString(),color:"yellow"});await save();render();}}
    if(action==="new-note"){const text=prompt("Write your note:");if(text?.trim()){data.notes.unshift({id:makeId(),text,note:text,createdAt:new Date().toISOString()});await save();render();}}
    if(action==="add-word"){document.querySelector("#vocab-entry-form input[name=word]")?.focus();}
    if(action==="add-category"){
      const name=prompt("Category heading or subheading name:");
      if(name?.trim()){
        const parentChoices=data.categories.map((c,i)=>`${i+1}. ${c.name}`).join("\n");
        const parentAnswer=prompt(`Optional parent category number (leave blank for a top-level heading):\n${parentChoices}`);
        const parent=parentAnswer?.trim()?data.categories[Number(parentAnswer)-1]:null;
        data.categories.push({id:makeId(),name:name.trim(),parentId:parent?.id||"",level:parent?(parent.level||0)+1:0,createdAt:new Date().toISOString()});
        await save();render();
      }
    }
    if(action==="edit-vocab"){
      const word=data.vocabulary.find(x=>x.id===id);if(word){
        const translation=prompt("Translation:",word.translation||"");
        if(translation!==null){
          const definition=prompt("Definition:",word.definition||"");
          if(definition!==null){
            const example=prompt("Example sentence:",word.example||"");
            if(example!==null){
              const exampleTranslation=prompt("Example translation:",word.exampleTranslation||"");
              if(exampleTranslation!==null){
                const notes=prompt("Personal notes:",word.notes||"");
                if(notes!==null){
                  const categoryChoices=data.categories.map((c,i)=>`${i+1}. ${c.name}`).join("\n");
                  const categoryAnswer=prompt(`Category number (blank = uncategorized):\n${categoryChoices}`,String(data.categories.findIndex(c=>c.id===word.categoryId)+1||""));
                  word.translation=translation;word.definition=definition;word.example=example;word.exampleTranslation=exampleTranslation;word.notes=notes;
                  if(categoryAnswer?.trim()) word.categoryId=data.categories[Number(categoryAnswer)-1]?.id||word.categoryId;
                  else word.categoryId="";
                  word.updatedAt=new Date().toISOString();await save();render();
                }
              }
            }
          }
        }
      }
    }
    if(action==="edit-category"){
      const category=data.categories.find(x=>x.id===id);if(category){
        const name=prompt("Category name:",category.name);if(name?.trim()){
          const parentOptions=data.categories.filter(x=>x.id!==id).map((c,i)=>`${i+1}. ${c.name}`).join("\n");
          const parentAnswer=prompt(`Parent category number (blank = top-level):\n${parentOptions}`);
          const possible=parentAnswer?.trim()?data.categories.filter(x=>x.id!==id)[Number(parentAnswer)-1]:null;
          category.name=name.trim();category.parentId=possible?.id||"";category.level=possible?(possible.level||0)+1:0;
          await save();render();
        }
      }
    }
    if(action==="delete-category"){
      const category=data.categories.find(x=>x.id===id);
      if(category && await askConfirmation(`Delete category "${category.name}"? Saved vocabulary will remain but become uncategorized; its subcategories will become top-level.`,"Delete category")){
        data.categories=data.categories.filter(x=>x.id!==id);
        data.categories.forEach(c=>{if(c.parentId===id){c.parentId="";c.level=0;}});
        data.vocabulary.forEach(w=>{if(w.categoryId===id)w.categoryId="";});
        await save();render();
      }
    }
    if(action==="copy-vocab"){
      const word=data.vocabulary.find(x=>x.id===id);if(word){await navigator.clipboard.writeText(`${word.word}\n${word.translation||""}\n${word.definition||""}`.trim());target.textContent="Copied ✓";}
    }
    if(action==="mark-mastered"){const word=data.vocabulary.find(x=>x.id===id);if(word){word.status="mastered";word.masteredAt=new Date().toISOString();await save();render();}}
    if(action==="delete-word"){data.vocabulary=data.vocabulary.filter(x=>x.id!==id);await save();render();}
    if(action.startsWith("export-vocabulary-")){
      const entries=data.vocabulary;
      if(action==="export-vocabulary-json") downloadText("charlie-mj-vocabulary.json",JSON.stringify({exportedAt:new Date().toISOString(),categories:data.categories,vocabulary:entries},null,2),"application/json");
      if(action==="export-vocabulary-md"){
        const lines=["# Charlie MJ Vocabulary Library","",...entries.map(w=>`**${w.word}**\n\n${w.translation||""}\n\n${w.definition||""}\n\n${w.example||""}\n\n${w.exampleTranslation||""}\n\nCategory: ${data.categories.find(c=>c.id===w.categoryId)?.name||"Uncategorized"}\n\nNotes: ${w.notes||""}\n\nSource: ${w.url||""}\n\n---`)];
        downloadText("charlie-mj-vocabulary.md",lines.join("\n"));
      }
      if(action==="export-vocabulary-csv"){
        const cols=["word","translation","definition","example","exampleTranslation","partOfSpeech","pronunciation","category","tags","notes","source","url","status","createdAt"];
        const q=value=>`"${String(value??"").replace(/"/g,'""')}"`;
        const rows=[cols.join(","),...entries.map(w=>cols.map(k=>q(k==="category"?data.categories.find(c=>c.id===w.categoryId)?.name||"":k==="tags"?(w.tags||[]).join("; "):w[k])).join(","))];
        downloadText("charlie-mj-vocabulary.csv",rows.join("\r\n"),"text/csv");
      }
    }
    if(action==="quiz"){
      const words=data.vocabulary.filter(w=>w.status!=="mastered"||!w.nextReviewAt||new Date(w.nextReviewAt)<=new Date());
      if(!words.length){alert("No words are due for review. Add vocabulary or review mastered entries from the library.");}
      else{
        const w=words[Math.floor(Math.random()*words.length)];
        const answer=prompt(`Recall the meaning of:\n\n${w.word}\n\nPress OK to reveal the answer.`);
        if(answer!==null){
          const correct=await askConfirmation(`Translation: ${w.translation||"Not added"}\nDefinition: ${w.definition||"Not added"}\n\nDid you remember it correctly?`,"Vocabulary review");
          w.reviewCount=(w.reviewCount||0)+1;
          w.status=correct?"learning":"difficult";
          const days=correct?Math.min(30,Math.max(1,2**Math.min(w.reviewCount,4))):1;
          w.nextReviewAt=new Date(Date.now()+days*86400000).toISOString();
          w.lastReviewedAt=new Date().toISOString();
          await save();render();
        }
      }
    }
    if(action==="details-article"){const a=data.articles.find(x=>x.id===id);if(a) await askConfirmation(`Website: ${a.siteName||a.domain||""}
Author: ${a.author||""}
Category: ${a.category||"General"}
Saved: ${a.savedAt||a.createdAt||""}
Modified: ${a.updatedAt||a.modifiedAt||""}
Words: ${a.wordCount||0}
Reading time: ${a.readingMinutes||1} min` ,"Article details");}
    if(action==="edit-article"){const a=data.articles.find(x=>x.id===id);if(a){const category=prompt("Category",a.category||"General");if(category!==null){a.category=category.trim()||"General";a.updatedAt=new Date().toISOString();await save();render();toast("Article updated","article");}}}
    if(action==="refresh-library"){data=await getAll();render();toast("Article Library refreshed","article");}
    if(action==="download-articles"){downloadText("charlie-mj-article-library.json",JSON.stringify({version:1,exportedAt:new Date().toISOString(),articles:data.articles},null,2),"application/json");toast("Article Library exported","export");}
    if(action==="export-captures"){downloadText("charlie-mj-captures.json",JSON.stringify({quotes:data.quotes,paragraphs:data.paragraphs,selections:data.selections},null,2),"application/json");toast("Captures exported","export");}
    if(action==="delete-bookmark"){data.bookmarks=data.bookmarks.filter(x=>x.id!==id);await save();render();}
    if(action==="delete-quote"){data.quotes=data.quotes.filter(x=>x.id!==id);await save();render();}
    if(action==="delete-paragraph"){data.paragraphs=data.paragraphs.filter(x=>x.id!==id);await save();render();}
    if(action==="delete-selection"){data.selections=data.selections.filter(x=>x.id!==id);await save();render();}
    if(action==="save-capture"){
      const text=document.getElementById("capture-text")?.value.trim(); if(!text) throw new Error("Select or enter text first.");
      const item={id:makeId(),text,articleId:activeArticle?.id||null,title:activeArticle?.title||"",url:activeArticle?.url||"",domain:activeArticle?.domain||"",siteName:activeArticle?.siteName||activeArticle?.domain||"",category:activeArticle?.category||"General",tags:activeArticle?.tags||[],labels:activeArticle?.labels||[],note:document.getElementById("capture-note")?.value.trim()||"",createdAt:new Date().toISOString()};
      const section=captureType==="vocabulary"?"vocabulary":captureType==="quote"?"quotes":captureType==="paragraph"?"paragraphs":"selections";
      if(section==="vocabulary") item.word=text; data[section].unshift(item); await save(); toast(`✓ ${captureType[0].toUpperCase()+captureType.slice(1)} saved`,captureType==="selection"?"selection":captureType); document.getElementById("capture-preview").textContent="Saved ✓";
    }
    if(action==="workspace-capture"){
      const selected=window.getSelection()?.toString().trim(), kind=target.dataset.kind||"selection";
      const block=window.getSelection()?.anchorNode?.parentElement?.closest("p,li,blockquote,h1,h2,h3,h4")||document.querySelector("#reading-article .active-sentence");
      const text=selected||(kind==="paragraph"?block?.innerText?.trim():"");
      if(!text) throw new Error("Select text first, or click inside a paragraph to save it.");
      const section=kind==="vocabulary"?"vocabulary":kind==="quote"?"quotes":kind==="paragraph"?"paragraphs":"selections";
      const item={id:makeId(),text,title:activeArticle?.title||"",articleId:activeArticle?.id||null,url:activeArticle?.url||"",domain:activeArticle?.domain||"",siteName:activeArticle?.siteName||"",position:currentWord,createdAt:new Date().toISOString(),category:activeArticle?.category||"General",tags:[],notes:""};
      if(section==="vocabulary") item.word=text; data[section].unshift(item); await save(); toast(`${kind[0].toUpperCase()+kind.slice(1)} saved`,kind); target.classList.add("is-active");
    }
    if(action==="save-capture-from-selection"){ const sel=window.getSelection()?.toString().trim(); if(sel){document.getElementById("capture-text").value=sel;} }
    if(action==="new-collection"){const name=prompt("Collection name:");if(name?.trim()){data.collections.unshift({id:makeId(),title:name.trim(),createdAt:new Date().toISOString(),items:[]});await save();render();}}
    if(action.startsWith("delete-")){const section={highlight:"highlights",word:"vocabulary",note:"notes",collection:"collections"}[action.slice(7)];if(section){data[section]=data[section].filter(x=>x.id!==id);await save();render();}}
  } catch(err){alert(err.message||"Action could not be completed.");}
});

document.addEventListener("click", event=>{ const tab=event.target.closest("[data-capture-type]"); if(tab){ captureType=tab.dataset.captureType; document.querySelectorAll("[data-capture-type]").forEach(x=>x.classList.toggle("is-active",x===tab)); const sel=window.getSelection()?.toString().trim(); if(sel) document.getElementById("capture-text").value=sel; }});
document.addEventListener("mouseup",()=>{ if(!activeArticle) return; const sel=window.getSelection()?.toString().trim(); if(sel && document.getElementById("capture-text")) document.getElementById("capture-text").value=sel; });

document.addEventListener("submit", async event => {
  if (event.target?.id !== "vocab-entry-form") return;
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(event.target).entries());
  const word = String(fields.word || "").trim();
  if (!word) return;
  const existing = data.vocabulary.find(item => item.word?.toLocaleLowerCase() === word.toLocaleLowerCase());
  const entry = {
    id: existing?.id || makeId(), word, translation: String(fields.translation||"").trim(),
    definition: String(fields.definition||"").trim(), categoryId: String(fields.categoryId||""),
    example: String(fields.example||"").trim(), exampleTranslation: String(fields.exampleTranslation||"").trim(),
    pronunciation: String(fields.pronunciation||"").trim(), partOfSpeech: String(fields.partOfSpeech||"").trim(),
    synonyms: String(fields.synonyms||"").trim(), tags: String(fields.tags||"").split(",").map(tag=>tag.trim()).filter(Boolean),
    notes: String(fields.notes||"").trim(), source: existing?.source || "Manual",
    url: existing?.url || "", createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(), status: existing?.status || "new",
    reviewCount: existing?.reviewCount || 0
  };
  if (existing) data.vocabulary = data.vocabulary.map(item => item.id===existing.id ? entry : item);
  else data.vocabulary.unshift(entry);
  await save(); render();
});


// Universal click acknowledgement: every reader action button gives bottom-corner feedback.
document.addEventListener("click",(event)=>{const b=event.target.closest("button");if(!b)return;const label=(b.textContent||"Action").trim().replace(/\s+/g," ").slice(0,48);if(["media-play","media-pause","bookmark-word","reader-close"].includes(b.dataset.action)){b.classList.toggle("is-active",true);b.setAttribute("aria-pressed","true");}if(label && !b.matches("[data-no-toast]"))toast(`${label} clicked`,"action","info");},{capture:true});

function getSearchValues(){return [...new Set([...(data.articles||[]).map(x=>x.title),...(data.vocabulary||[]).map(x=>x.word),...(data.quotes||[]).map(x=>x.text),...(data.paragraphs||[]).map(x=>x.text),...(data.notes||[]).map(x=>x.title||x.text)].filter(Boolean).map(v=>String(v).trim()).filter(Boolean))].slice(0,500);}
function refreshSearchSuggestions(){const dl=document.getElementById("cmj-search-suggestions");if(dl)dl.replaceChildren(...getSearchValues().slice(0,250).map(v=>{const o=document.createElement("option");o.value=v.slice(0,180);return o;}));}
const searchInput=document.getElementById("global-search"), hintBox=document.getElementById("cmj-search-hints");
function renderSearchHints(){if(!searchInput||!hintBox)return;const q=searchInput.value.trim();if(!q){hintBox.hidden=true;hintBox.replaceChildren();return;}const matches=getSearchValues().filter(v=>v.toLocaleLowerCase().includes(q.toLocaleLowerCase())).slice(0,8);hintBox.innerHTML=matches.map(v=>{const i=v.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());return `<button type="button" class="cmj-search-hint" data-search-value="${esc(v)}">${esc(v.slice(0,i))}<mark>${esc(v.slice(i,i+q.length))}</mark>${esc(v.slice(i+q.length))}</button>`;}).join("");hintBox.hidden=!matches.length;}
refreshSearchSuggestions();
searchInput?.addEventListener("input",()=>{refreshSearchSuggestions();renderSearchHints();if(["dashboard","library","vocabulary","saved"].includes(route))render();});
searchInput?.addEventListener("focus",renderSearchHints);
searchInput?.addEventListener("keydown",e=>{if(e.key==="Escape"&&hintBox)hintBox.hidden=true;});
document.addEventListener("click",e=>{const hint=e.target.closest("[data-search-value]");if(hint&&searchInput){searchInput.value=hint.dataset.searchValue;hintBox.hidden=true;if(["dashboard","library","vocabulary"].includes(route))render();}else if(!e.target.closest(".cmj-search-wrap")&&hintBox)hintBox.hidden=true;});
document.addEventListener("input",event=>{ if(event.target?.id==="article-filter"){ const q=event.target.value.toLowerCase(); const filtered=data.articles.filter(a=>`${a.title} ${a.domain} ${a.siteName} ${a.author} ${a.category} ${(a.tags||[]).join(" ")}`.toLowerCase().includes(q)); document.querySelector(".article-grid")?.replaceWith(Object.assign(document.createElement("div"),{className:"article-grid",innerHTML:filtered.map(articleCard).join("")})); }});
document.getElementById("theme-toggle")?.addEventListener("click",async()=>{const light=document.body.dataset.theme!=="light";document.body.dataset.theme=light?"light":"dark";document.body.style.background=light?"#f5f6fb":"#0b1020";document.body.style.color=light?"#18213a":"#edf0ff";});
document.getElementById("settings-link")?.addEventListener("click",()=>chrome.runtime.openOptionsPage());
document.addEventListener("change", event => {
  const el = event.target;
  if (el.id === "audio-speed") { audioSettings.speed = Number(el.value); data.settings.ttsRate = audioSettings.speed; save(); }
  if (el.id === "audio-voice") { audioSettings.voiceURI = el.value; data.settings.audioVoiceURI = el.value; save(); }
  if (el.id === "highlight-mode") { audioSettings.highlightMode = el.value; data.settings.audioHighlightMode = el.value; save(); updateAudioProgress(currentWord, audioState); }
  if (el.id === "auto-scroll") { audioSettings.autoScroll = el.checked; data.settings.audioAutoScroll = el.checked; save(); }
  if (el.id === "focus-mode") { audioSettings.focusMode = el.checked; updateAudioProgress(currentWord, audioState); }
  if (el.id === "smart-pause") audioSettings.smartPause = el.checked;
  if (el.id === "sleep-timer") { audioSettings.sleepMinutes = Number(el.value); }
  if (el.id === "reader-font" || el.id === "reader-width" || el.id === "reader-line") {
    const articleEl=document.getElementById("reading-article");
    if (articleEl) {
      if (el.id==="reader-font") { data.settings.fontSize=Number(el.value); articleEl.style.setProperty("--reader-font-size",`${el.value}px`); }
      if (el.id==="reader-width") { data.settings.readingWidth=Number(el.value); articleEl.style.setProperty("--reader-width",`${el.value}px`); }
      if (el.id==="reader-line") { data.settings.lineHeight=Number(el.value); articleEl.style.setProperty("--reader-line-height",el.value); }
      save();
    }
  }
  if (el.id === "reader-theme") { data.settings.readingTheme=el.value; document.getElementById("reading-article")?.setAttribute("data-reading-theme",el.value); save(); }
});
// The import input is created dynamically by render() on the Library/History route.
// Delegate the change event so this handler works even when the input did not exist
// at initial script evaluation (for example, when opening #dashboard first).
document.addEventListener("change", async (event) => {
  if (event.target?.id !== "import-file") return;
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    const imported = parsed?.data || parsed;
    if (!imported || typeof imported !== "object" || Array.isArray(imported)) {
      throw new Error("The selected backup does not contain a valid library object.");
    }

    // Merge missing collections with defaults to keep older backups compatible.
    const defaults = await getAll();
    data = { ...defaults, ...imported };
    for (const key of ["articles", "highlights", "vocabulary", "categories", "notes", "collections", "readingHistory", "deleted", "topics"]) {
      if (!Array.isArray(data[key])) data[key] = [];
    }
    await saveAll(data);
    render();
    alert("Backup imported successfully.");
  } catch (error) {
    alert(error?.message || "The backup could not be imported.");
  } finally {
    event.target.value = "";
  }
});
document.addEventListener("keydown", event => {
  if (!activeArticle || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName || "")) return;
  if (event.code === "Space") { event.preventDefault(); if (audioState === "playing") { speechSynthesis.pause(); audioState = "paused"; stopWordFallback(); updateAudioProgress(currentWord, "paused"); } else playArticleAudio(); }
  if (event.code === "ArrowRight") { event.preventDefault(); jumpSentence(1); }
  if (event.code === "ArrowLeft") { event.preventDefault(); jumpSentence(-1); }
  if (event.key.toLowerCase() === "b") { data.bookmarks.unshift({id:makeId(),articleId:activeArticle.id,title:activeArticle.title,position:currentWord,percent:Math.round(currentWord/Math.max(1,activeWordCount)*100),createdAt:new Date().toISOString()}); save(); toast("✓ Reading position bookmarked","bookmark"); }
});
window.addEventListener("hashchange",()=>{
  const nextRoute = location.hash.slice(1) || "dashboard";
  // Keep the active session alive when navigating to the dedicated Media tab.
  if (activeArticle && nextRoute === "media") { route = "media"; title.textContent = "Productivity Reader"; return; }
  if (activeArticle && nextRoute !== "media") { speechSynthesis.cancel(); stopWordFallback(); activeArticle = null; }
  route = nextRoute;
  render();
});
render();
if (initialArticleId) { const initial = data.articles.find(a=>a.id===initialArticleId); if (initial) openRead(initial, false); }


// Deep-link from the Medium page toolbar into the full reader workspace.
const launchArticleId = new URLSearchParams(location.search).get("articleId");
if (launchArticleId) {
  const launchArticle = data.articles.find(article => article.id === launchArticleId);
  if (launchArticle) openRead(launchArticle, false);
}
