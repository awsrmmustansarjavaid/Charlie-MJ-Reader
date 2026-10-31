/** Charlie MJ Reader — site-gated Toolbars. */
(() => {
  if (window.__cmjReaderLoaded) return;
  window.__cmjReaderLoaded = true;

  const hostMatches = (host, domain) => { const d=String(domain||'').toLowerCase().trim().replace(/^https?:\/\//,'').replace(/\/.*$/,''); return !!d && (host === d || host.endsWith(`.${d}`)); };
  let settings = {};
  let site = null;
  let toolbarAllowedNow = false;
  const isFreediumHost = host => /(^|\.)freedium-mirror\.cfd$/i.test(host || "");
  // The Freedium mirror is the reading surface for Medium, so it inherits Medium's allow-list status.
  const effectiveHost = () => isFreediumHost(location.hostname) ? "medium.com" : location.hostname;
  const originalArticleUrl = () => {
    if (!isFreediumHost(location.hostname)) return location.href;
    const m = location.pathname.replace(/^\/+/, "") + location.search;
    const full = /^https?:\/\//i.test(m) ? m : (/^https?:\/(?!\/)/i.test(m) ? m.replace(/^(https?:)\//i, "$1//") : "");
    if (full) { try { return new URL(full).href; } catch {} }
    return document.querySelector('link[rel="canonical"]')?.href || location.href;
  };
  let libraryDomains = new Set();
  let selectedText = "";
  let selectionRange = null;
  let timer = null;
  let timerMode = "";
  let timerPhase = "work";
  let timerEnd = 0;
  let timerInterval = null;
  let mediaUtterance = null;
  let mediaWords = [];
  let mediaState = "ready";
  let lastArticleSnapshot = null;
  let lastScrollSave = 0;
  let manualScrollUntil = 0;

  const toolbar = document.createElement("aside");
  toolbar.id = "cmj-toolbars";
  toolbar.hidden = true;
  toolbar.setAttribute("role", "toolbar");
  toolbar.innerHTML = `
    <div class="cmj-mainbar">
      <strong class="cmj-brand">CMJ</strong>
      <button data-tool="reader">Reader Workspace</button>
      <button data-tool="vocabulary">Vocabulary</button>
      <button data-tool="media">Productivity Reader</button>
      <button data-tool="focus">Focus</button>
      <button data-tool="productivity">Productivity</button>
      <button data-tool="night">☾</button>
      <button data-tool="close" aria-label="Hide toolbar">×</button>
    </div>
    <section class="cmj-panel cmj-vocab-panel" data-panel="vocabulary" hidden>
      <div class="cmj-selected"><b>Selected text</b><span id="cmj-selected-text"></span></div>
      <div class="cmj-actions"><button data-action="translate">See Translate</button><button data-action="meaning">Meaning</button><button data-action="save">＋ Vocabulary</button><button data-action="quote">💬 Quote</button><button data-action="paragraph">¶ Paragraph</button><button data-action="selection">✂ Selection</button><button data-action="copy">Copy</button><button data-action="notes">Notes</button><button data-action="pronunciation">Pronunciation</button></div>
      <div class="cmj-result" hidden><div class="cmj-original"></div><div class="cmj-translation"></div><div class="cmj-message"></div></div>
    </section>
    <section class="cmj-panel cmj-media-panel" data-panel="media" hidden>
      <div class="cmj-row"><b>Media / Smart Reader</b><span id="cmj-media-status">Ready</span></div>
      <div class="cmj-progress"><span id="cmj-media-progress"></span></div><div class="cmj-mini" id="cmj-media-percent">0%</div>
      <div class="cmj-actions"><button data-action="listen">▶ Listen in Productivity Reader</button><button data-action="media-play">▶ Play</button><button data-action="pause">Ⅱ Pause</button><button data-action="stop">■ Stop</button><button data-action="bookmark-page">🔖 Bookmark position</button></div>
      <label class="cmj-field">Speed <input id="cmj-media-speed" type="range" min="0.5" max="2.5" step="0.1" value="1"><span id="cmj-speed-value">1×</span></label>
    </section>
    <section class="cmj-panel" data-panel="focus" hidden>
      <div class="cmj-actions"><button data-action="focus-toggle">Focus</button><button data-action="adblock">Ads</button><button data-action="day">Day</button><button data-action="night">Night</button><button data-action="auto">Auto</button><button data-action="native-read">Native Read</button><button data-action="native-stop">Stop Read</button></div>
      <div class="cmj-mini">Brightness <input id="cmj-brightness" type="range" min="50" max="150" value="100"></div>
      <div class="cmj-mini">Contrast <input id="cmj-contrast" type="range" min="50" max="150" value="100"></div>
      <div class="cmj-mini">Opacity <input id="cmj-opacity" type="range" min="40" max="100" value="100"></div>
    </section>
    <section class="cmj-panel cmj-productivity-panel" data-panel="productivity" hidden>
      <div class="cmj-row"><b>Productivity</b><span id="cmj-timer">Ready</span></div>
      <div class="cmj-actions"><button data-action="focus-open">Focus</button><button data-action="day">Day/Night</button><button data-action="pomodoro">Pomodoro</button><button data-action="eighty">80/20</button><button data-action="timer-stop">Stop</button></div>
      <div class="cmj-mini">Pomodoro: <input id="cmj-work" type="number" min="1" max="180" value="25"> min work / <input id="cmj-break" type="number" min="1" max="60" value="5"> min break</div>
    </section>`;
  document.documentElement.append(toolbar);

  const q = (sel) => toolbar.querySelector(sel);
  const panels = [...toolbar.querySelectorAll("[data-panel]")];

  function defaultProfile(domain = location.hostname) {
    return {domain,enabled:true,toolbar:true,vocabulary:true,media:true,focus:true,productivity:true,nativeReading:true};
  }

  function getSupportedProfile() {
    const list = Array.isArray(settings.websites) ? settings.websites : [];
    return list.map(x => typeof x === "string" ? defaultProfile(x) : x)
      .find(x => x && x.enabled !== false && x.domain && hostMatches(effectiveHost(), String(x.domain).toLowerCase().trim())) || null;
  }

  function toolbarDomainAllowed() {
    const mode = settings.mainToolbarVisibility || "supported_and_library";
    if (mode === "all") return true;
    const supported = !!getSupportedProfile();
    const inLibrary = [...libraryDomains].some(domain => hostMatches(effectiveHost(), domain));
    if (mode === "supported") return supported;
    if (mode === "library") return inLibrary;
    return supported || inLibrary;
  }

  function hideAll() { toolbar.hidden = true; panels.forEach(p => p.hidden = true); }
  function showPanel(name) { panels.forEach(p => p.hidden = p.dataset.panel !== name); toolbar.hidden = false; }

  function applyFocus() {
    const active = !!site && settings.focusEnabled !== false && site.focus !== false;
    document.documentElement.classList.toggle("cmj-focus-active", active);
    document.documentElement.classList.toggle("cmj-hide-images-active", active && settings.focusHideImages === true);
    if (!active) {
      document.documentElement.style.removeProperty("--cmj-brightness"); document.documentElement.style.removeProperty("--cmj-contrast"); document.documentElement.style.removeProperty("--cmj-opacity");
      document.documentElement.style.removeProperty("--cmj-blur"); document.documentElement.style.removeProperty("--cmj-warmth"); document.documentElement.style.removeProperty("--cmj-font-scale");
      return;
    }
    const mode = settings.dayNightMode || "day";
    const night = mode === "night" || (mode === "auto" && [19,20,21,22,23,0,1,2,3,4,5,6].includes(new Date().getHours()));
    document.documentElement.style.setProperty("--cmj-brightness", `${settings.focusBrightness ?? (night ? 82 : 100)}%`);
    document.documentElement.style.setProperty("--cmj-contrast", `${settings.focusContrast ?? (night ? 92 : 100)}%`);
    document.documentElement.style.setProperty("--cmj-opacity", `${settings.focusOpacity ?? 100}%`);
    document.documentElement.style.setProperty("--cmj-blur", `${settings.focusBlur ?? 0}px`);
    document.documentElement.style.setProperty("--cmj-warmth", `${settings.focusWarmth ?? 0}%`);
    document.documentElement.style.setProperty("--cmj-font-scale", `${settings.focusFontScale ?? 100}%`);
  }

  function clearAds() { document.querySelectorAll('[data-cmj-ad-hidden="1"]').forEach(el => el.removeAttribute("data-cmj-ad-hidden")); }
  function applyAds() {
    if (!site || settings.adBlockEnabled === false || site.focus === false) { clearAds(); return; }
    const selectors = [
      '[id*="ad-" i]','[id*="advert" i]','[class*="advert" i]','[class*="ad-container" i]','[class*="adsbygoogle" i]',
      '[data-ad]','[aria-label*="advertisement" i]','iframe[src*="doubleclick"]','iframe[src*="googlesyndication"]'
    ];
    document.querySelectorAll(selectors.join(',')).forEach(el => { if (!toolbar.contains(el)) el.setAttribute('data-cmj-ad-hidden','1'); });
  }

  function clearNativeReading() {
    document.querySelectorAll(".cmj-native-word").forEach(el => { const text=document.createTextNode(el.textContent||""); el.replaceWith(text); });
    document.querySelectorAll(".cmj-native-line, .cmj-native-active").forEach(el=>el.classList.remove("cmj-native-line","cmj-native-active"));
  }
  let nativeReadingTimer=null, nativeObserver=null, nativeReadingDelayTimer=null;
  function startNativeReading() {
    if (!toolbarAllowedNow || !site || site.nativeReading === false || settings.nativeReadingEnabled === false) return;
    clearNativeReading(); clearInterval(nativeReadingTimer); clearTimeout(nativeReadingDelayTimer);
    const root=document.querySelector("article,main,[role=\"main\"],.post-content,.article-content")||document.body;
    const nodes=[...root.querySelectorAll("p,h1,h2,h3,li,blockquote,pre")].filter(n=>!toolbar.contains(n)&&n.innerText.trim());
    const words=[];
    nodes.forEach(line=>{ const walker=document.createTreeWalker(line,NodeFilter.SHOW_TEXT); const texts=[]; while(walker.nextNode()) if(walker.currentNode.nodeValue.trim()) texts.push(walker.currentNode); texts.forEach(t=>{ const frag=document.createDocumentFragment(); const parts=t.nodeValue.split(/(\s+)/); parts.forEach(part=>{ if(/^\s+$/.test(part)){frag.appendChild(document.createTextNode(part));return;} const span=document.createElement("span"); span.className="cmj-native-word"; span.textContent=part; frag.appendChild(span); words.push(span); }); t.parentNode?.replaceChild(frag,t); }); line.classList.add("cmj-native-line"); });
    let idx=0; const tick=()=>{ words.forEach(w=>w.classList.remove("cmj-native-active")); const w=words[idx++]; if(!w){clearInterval(nativeReadingTimer);return;} w.classList.add("cmj-native-active"); w.scrollIntoView({block:"center",behavior:"smooth"}); document.documentElement.style.setProperty("--cmj-native-word-color", settings.nativeHighlightWordColor || "#f0a34a"); document.documentElement.style.setProperty("--cmj-native-line-color", settings.nativeHighlightLineColor || "#8b7cff"); };
    const seconds=Math.max(0.5,Number(settings.nativeReadingTimer||10));
    const delay=Math.max(0,Number(settings.nativeReadingDelay||0))*1000;
    const begin=()=>{tick();nativeReadingTimer=setInterval(tick,seconds*1000);};
    if(delay) nativeReadingDelayTimer=setTimeout(begin,delay); else begin();
    if(nativeObserver) nativeObserver.disconnect(); nativeObserver=new MutationObserver(()=>{});
  }
  async function refresh() {
    const stored = await chrome.storage.local.get("settings");
    settings = {toolbarEnabled:true,mainToolbarVisibility:"supported_and_library",toolbarPosition:"top",toolbarOpacity:92,toolbarModules:{reader:true,vocabulary:true,media:true,focus:true,productivity:true},toolbarThemes:{main:"midnight",media:"midnight",vocabulary:"violet",productivity:"focus"},vocabularyToolbarEnabled:true,mediaToolbarEnabled:true,productivityToolbarEnabled:true,focusEnabled:false,adBlockEnabled:true,focusBrightness:100,focusContrast:100,focusOpacity:100,dayNightMode:"day",mediaSpeed:1,pomodoroWork:25,pomodoroBreak:5,nativeReadingEnabled:true,nativeReadingTimer:10,freediumEnabled:true,freediumAutoOpen:true,...(stored.settings||{})};
    if (!settings.cmjFreedium112Migrated) {
      settings.freediumEnabled = true;
      settings.freediumAutoOpen = true;
      settings.cmjFreedium112Migrated = true;
      await chrome.storage.local.set({settings});
    }
    if(!Array.isArray(settings.websites)) settings.websites=[];
    const library = (await chrome.storage.local.get(["readingLibrary","articles"]));
    const domains = new Set();
    const addDomain = value => {
      try {
        const raw=String(value||"").trim();
        if(!raw) return;
        const candidate=/^https?:\/\//i.test(raw) ? new URL(raw).hostname : raw.replace(/^\/\//,"").split("/")[0];
        const normalized=candidate.toLowerCase().replace(/^www\./,"");
        if(normalized) domains.add(normalized);
      } catch {}
    };
    const rl=library.readingLibrary||{};
    Object.keys(rl.websiteData||{}).forEach(addDomain);
    (Array.isArray(library.articles)?library.articles:[]).forEach(a=>{ addDomain(a.domain); addDomain(a.url); });
    libraryDomains=domains;
    const mediumHost = /(^|\.)medium\.com$/i.test(location.hostname);
    if (mediumHost && !window.__cmjMediumOpened && settings.mediumEnabled !== false && settings.freediumEnabled === true && settings.freediumAutoOpen === true) {
      window.__cmjMediumOpened = true;
      chrome.runtime.sendMessage({type:"CMJ_MEDIUM_AUTO_OPEN", url: location.href, canonicalUrl: document.querySelector('link[rel="canonical"]')?.href || location.href}).catch(err => { if (!String(err?.message||err).includes("Extension context invalidated")) console.debug("CMJ Medium handoff:", err); });
    }
    const supportedProfile = getSupportedProfile();
    const toolbarAllowed = toolbarDomainAllowed();
    toolbarAllowedNow = !!toolbarAllowed && settings.toolbarEnabled !== false;
    // Sites outside the selected allow-list get no toolbar, no selection popup, no focus/ad tools.
    site = toolbarAllowed ? (supportedProfile || defaultProfile(location.hostname)) : null;
    if (!site || settings.toolbarEnabled === false || site.toolbar === false) { toolbarAllowedNow = false; hideAll(); clearAds(); applyFocus(); } else {
    toolbar.hidden = false;
    toolbar.style.display = "block";
    toolbar.style.visibility = "visible";
    const themes=settings.toolbarThemes||{};
    toolbar.dataset.mainTheme=site.toolbarTheme||themes.main||"midnight"; toolbar.dataset.mediaTheme=site.mediaTheme||themes.media||"midnight"; toolbar.dataset.vocabTheme=site.vocabularyTheme||themes.vocabulary||"violet"; toolbar.dataset.productivityTheme=site.productivityTheme||themes.productivity||"focus";
    toolbar.style.opacity = String((site.toolbarOpacity ?? settings.toolbarOpacity ?? 92) / 100);
    toolbar.dataset.position = site.position || settings.toolbarPosition || "top";
    toolbar.dataset.type = site.toolbarType || settings.toolbarType || "floating";
    const modules = settings.toolbarModules || {reader:true,vocabulary:true,media:true,focus:true,productivity:true};
    toolbar.querySelector('[data-tool="reader"]').hidden = modules.reader === false;
    toolbar.querySelector('[data-tool="vocabulary"]').hidden = site.vocabulary === false || modules.vocabulary === false;
    toolbar.querySelector('[data-tool="media"]').hidden = site.media === false || modules.media === false;
    toolbar.querySelector('[data-tool="focus"]').hidden = site.focus === false || modules.focus === false;
    toolbar.querySelector('[data-tool="productivity"]').hidden = site.productivity === false || modules.productivity === false;
    q('#cmj-media-speed').value = settings.mediaSpeed || 1;
    q('#cmj-speed-value').textContent = `${settings.mediaSpeed || 1}×`;
    q('#cmj-brightness').value = settings.focusBrightness || 100;
    q('#cmj-contrast').value = settings.focusContrast || 100;
    q('#cmj-opacity').value = settings.focusOpacity || 100;
    q('#cmj-work').value = settings.pomodoroWork || 25;
    q('#cmj-break').value = settings.pomodoroBreak || 5;
    applyFocus(); applyAds(); updateReadingFocus();
    }
  }

  async function expandFreediumArticle() {
    if (!/freedium-mirror\.cfd$/i.test(location.hostname)) return;
    const clickTargets = () => {
      const nodes = [...document.querySelectorAll('button,a,[role="button"],summary')];
      let clicked = 0;
      for (const el of nodes) {
        const label = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!label) continue;
        if (/^show all(?: \d+)? sections?$/.test(label) || /^show all/.test(label) || label === 'read more') {
          try { el.click(); clicked++; } catch {}
        }
      }
      return clicked;
    };
    clickTargets();
    await new Promise(r => setTimeout(r, 450));
    clickTargets();
    await new Promise(r => setTimeout(r, 650));
    clickTargets();
  }

  async function articleReady() {
    await expandFreediumArticle();
  }

  // Structure-agnostic article root: descend from <body> while a single child still holds
  // (almost) all of the readable text. Works for any Medium story layout.
  function bestContentRoot(doc) {
    const blockSel = "p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,figcaption";
    const weight = el => { let n = 0; el.querySelectorAll(blockSel).forEach(b => { if (!b.closest("nav,footer,aside,form,script,style,noscript")) n += (b.textContent || "").trim().length; }); return n; };
    let node = doc.body; if (!node) return null;
    const total = weight(node); if (!total) return node;
    for (let guard = 0; guard < 40; guard++) {
      let next = null, nextW = 0;
      for (const child of node.children) { const w = weight(child); if (w > nextW) { next = child; nextW = w; } }
      if (next && nextW >= total * 0.9) node = next; else break;
    }
    return node;
  }
  const textWeight = el => (el?.textContent || "").replace(/\s+/g, " ").trim().length;
  // Challenge / error pages are not articles (generic markers, not article-specific).
  const isChallengePage = html => /<title>\s*(just a moment|attention required|access denied|checking your browser|ddos protection)/i.test(html) || /cf-browser-verification|cf-challenge|challenge-platform|enable javascript and cookies to continue/i.test(html.slice(0, 60000)) && !/<article|<p[ >]/i.test(html.slice(0, 60000));

  function buildArticleFromDocument(doc, pageUrl, sourceUrl = pageUrl) {
    const freedium = /freedium-mirror\.cfd$/i.test(new URL(pageUrl).hostname);
    const selectors = freedium
      ? [
          'article', 'main', '[role="main"]',
          '[data-testid="post-content"]', '.post-content', '.article-content',
          '.article-body', '.post-body', '.story-content', '.reader-article',
          '.pw-post-body-paragraph', '.meteredContent', '.postArticle-content',
          '[class*="article-content"]', '[class*="post-content"]'
        ]
      : ["article","main","[role=\"main\"]",".post-content",".article-content",".entry-content",".story-content",".article-body",".post-body"];
    const candidates=[...doc.querySelectorAll(selectors.join(","))];
    const score=el=>{
      const text=(el.innerText||el.textContent||"").replace(/\s+/g," ").trim();
      const lower=text.toLowerCase();
      const p=el.querySelectorAll("p").length;
      const h=el.querySelectorAll("h1,h2,h3,h4").length;
      const links=el.querySelectorAll("a").length;
      let value=text.length+(p*220)+(h*300)-(links*8);
      // Prefer substantial article containers, but never score against phrases
      // from one particular article. Medium stories have many different structures.
      if (freedium && text.length > 1500) value += 5000;
      if (freedium && p >= 4) value += p * 120;
      return value;
    };
    let root=(candidates.length ? candidates.sort((a,b)=>score(b)-score(a))[0] : doc.body) || doc.body;
    // If the selector match holds clearly less text than the true article container, use the container.
    const generic=bestContentRoot(doc);
    if (generic && generic !== root && textWeight(generic) > textWeight(root) * 1.15) root = generic;
    const clone=root.cloneNode(true);
    clone.querySelectorAll("script,style,noscript,nav,footer,aside,form,[role='navigation'],[role='contentinfo'],button,[role='button'],.share,.sharing,.navigation").forEach(el=>el.remove());
    // Keep page headers that carry the article title/lead; drop pure navigation headers.
    clone.querySelectorAll("header").forEach(el=>{ if(!el.querySelector("h1,h2,p")) el.remove(); });
    const text=(clone.innerText||clone.textContent||"").replace(/\n{3,}/g,"\n\n").trim();
    const html=clone.innerHTML||"";
    const words=text.split(/\s+/).filter(Boolean);
    const meta=(selector,attr="content")=>doc.querySelector(selector)?.getAttribute(attr)||"";
    const title=(meta('meta[property="og:title"]')||doc.querySelector("h1")?.innerText||doc.title||"").trim();
    const tags=[...doc.querySelectorAll('meta[property="article:tag"],meta[name="keywords"]')].flatMap(x=>(x.getAttribute("content")||"").split(",")).map(x=>x.trim()).filter(Boolean);
    const labels=[...doc.querySelectorAll('[rel="tag"],.tag,.tags a')].map(x=>(x.textContent||"").trim()).filter(Boolean);
    return {
      id:crypto.randomUUID(), title, url:sourceUrl, domain:new URL(sourceUrl).hostname,
      canonicalUrl:meta('link[rel="canonical"]',"href")||sourceUrl,
      siteName:meta('meta[property="og:site_name"]')||"Medium",
      text, html, contentBaseUrl:pageUrl,
      wordCount:words.length, readingMinutes:Math.max(1,Math.ceil(words.length/220)),
      author:meta('meta[name="author"]')||doc.querySelector('[rel="author"]')?.textContent?.trim()||"",
      image:meta('meta[property="og:image"]')||root.querySelector('img')?.src||"",
      description:meta('meta[name="description"]')||meta('meta[property="og:description"]')||"",
      publishedAt:meta('meta[property="article:published_time"]')||doc.querySelector('time[datetime]')?.getAttribute('datetime')||"",
      category:meta('meta[property="article:section"]')||"General",
      tags:[...new Set(tags)], labels:[...new Set(labels)], imageCount:root.querySelectorAll('img').length,
      linkCount:root.querySelectorAll('a[href]').length, savedAt:new Date().toISOString(),
      extractionSource:freedium ? "freedium" : "page"
    };
  }

  async function fetchFreediumArticle() {
    const host=location.hostname.toLowerCase();
    const isMedium=host === "medium.com" || host.endsWith(".medium.com");
    const isFreedium=/freedium-mirror\.cfd$/i.test(host);
    if (!isMedium && !isFreedium) return null;
    let response;
    try { response=await chrome.runtime.sendMessage({type:"CMJ_FETCH_FREEDIUM_HTML",sourceUrl:location.href}); }
    catch (err) { if (String(err?.message||err).includes("Extension context invalidated")) return null; throw err; }
    if (!response?.ok || !response.html) return null;
    if (isChallengePage(response.html)) return null;
    const doc=new DOMParser().parseFromString(response.html,"text/html");
    const sourceUrl=isMedium ? location.href : originalArticleUrl();
    const remote=buildArticleFromDocument(doc,response.finalUrl||response.url||location.href,sourceUrl);
    if (!remote?.text) return null;
    // Do not reject a fetched article based on article-specific words or headings.
    // Different Medium stories have different structures and may not contain a conclusion.
    return remote;
  }

  async function getArticle() {
    await articleReady();
    let remote=null;
    try { remote=await fetchFreediumArticle(); }
    catch (e) { console.debug("Charlie MJ Freedium extraction fallback:", e); }
    const onFreedium=isFreediumHost(location.hostname);
    if (onFreedium) {
      // The live Freedium tab is already the full mirrored article; use whichever capture is more complete.
      const live=buildArticleFromDocument(document, location.href, originalArticleUrl());
      const best=(remote?.text?.trim() && remote.wordCount >= live.wordCount) ? remote : live;
      lastArticleSnapshot=best; return best;
    }
    if (remote && remote.text && remote.text.trim()) { lastArticleSnapshot=remote; return remote; }
    lastArticleSnapshot=buildArticleFromDocument(document, location.href, location.href); return lastArticleSnapshot;
  }

  function article() {
    lastArticleSnapshot=buildArticleFromDocument(document, location.href, originalArticleUrl()); return lastArticleSnapshot;
  }
  async function send(type, extra={}) { const currentArticle=await getArticle(); try { return await chrome.runtime.sendMessage({type,text:selectedText,article:currentArticle,...extra}); } catch (err) { if (String(err?.message||err).includes("Extension context invalidated") || !chrome.runtime?.id) throw new Error("Charlie MJ Reader was reloaded or updated. Refresh this webpage to reconnect it."); throw err; } }

  async function translate() {
    q('.cmj-result').hidden=false; q('.cmj-translation').textContent='Translating…';
    try { const r=await send('CMJ_TRANSLATE_TEXT',{text:selectedText}); if(!r?.ok) throw Error(r?.error||'Translation unavailable.'); q('.cmj-translation').textContent=r.translation; q('.cmj-message').textContent='Original is bold; translation is normal weight.'; toolbar.dataset.translation=r.translation; }
    catch(e){q('.cmj-message').textContent=e.message;}
  }
  function updateMediaProgress(word=0,status=mediaState){ const total=mediaWords.length; const pct=total?Math.min(100,Math.round(word/total*100)):0; q("#cmj-media-progress").style.width=`${pct}%`; q("#cmj-media-percent").textContent=`${pct}% · ${status}`; q("#cmj-media-status").textContent=status; }
  async function playLocalMedia(){ const a=await getArticle(); if(!a.text)return; const text=a.text; mediaWords=text.split(/\s+/).filter(Boolean); if(speechSynthesis.paused){speechSynthesis.resume();mediaState="Playing";updateMediaProgress();return;} speechSynthesis.cancel(); mediaUtterance=new SpeechSynthesisUtterance(text); mediaUtterance.rate=Number(settings.mediaSpeed||1); mediaUtterance.volume=Number(settings.mediaVolume??1); mediaUtterance.onstart=()=>{mediaState="Playing";updateMediaProgress(0,"Playing")}; mediaUtterance.onboundary=e=>{if(e.name!=="word")return;const n=text.slice(0,e.charIndex).trim().split(/\s+/).filter(Boolean).length;updateMediaProgress(n,"Playing")}; mediaUtterance.onend=()=>{mediaState="Stopped";updateMediaProgress(mediaWords.length,"Completed")}; mediaUtterance.onerror=()=>{mediaState="Stopped";updateMediaProgress(0,"Stopped")}; speechSynthesis.speak(mediaUtterance);}
  function pauseLocalMedia(){if(speechSynthesis.speaking&&!speechSynthesis.paused){speechSynthesis.pause();mediaState="Paused";updateMediaProgress(undefined,"Paused")}}
  function stopLocalMedia(){speechSynthesis.cancel();mediaState="Stopped";updateMediaProgress(0,"Stopped")}

  async function saveVocab() { const r=await send('CMJ_SAVE_VOCABULARY',{word:selectedText,translation:toolbar.dataset.translation||''}); q('.cmj-result').hidden=false; q('.cmj-message').textContent=r?.ok?'Saved to Vocabulary Library.':(r?.error||'Could not save.'); if(r?.ok) cmjToast('✓ Vocabulary saved'); }

  function cmjToast(message,event="article"){ const n=settings.notifications||{}, events=n.events||{}; if(n.enabled===false||events[event]===false)return; const host=document.getElementById("cmj-page-toasts")||(()=>{const x=document.createElement("div");x.id="cmj-page-toasts";document.documentElement.append(x);return x;})(); host.dataset.position=["bottom-right","bottom-left","top-right","top-left"].includes(n.position)?n.position:"bottom-right"; const e=document.createElement("div");e.className="cmj-page-toast";e.setAttribute("role","status");e.textContent=message;host.append(e);setTimeout(()=>e.remove(),Math.max(1000,Number(n.durationMs||2600))); }
  async function saveCapture(type,text){ const value=String(text||selectedText||"").trim(); if(!value)return; const a=lastArticleSnapshot||await getArticle(); const record={id:crypto.randomUUID(),type,text:value,articleId:a.id,title:a.title,url:a.url,domain:a.domain,siteName:a.siteName,category:a.category||"General",tags:a.tags||[],labels:a.labels||[],createdAt:new Date().toISOString(),selection:{start:selectionRange?.startOffset||0,end:selectionRange?.endOffset||0}}; const stored=await chrome.storage.local.get(["vocabulary","quotes","paragraphs","selections"]); const key=type==="vocabulary"?"vocabulary":type==="quote"?"quotes":type==="paragraph"?"paragraphs":"selections"; const list=Array.isArray(stored[key])?stored[key]:[]; if(type==="vocabulary") record.word=value; list.unshift(record); await chrome.storage.local.set({[key]:list}); cmjToast(`✓ ${type[0].toUpperCase()+type.slice(1)} saved`); }
  async function savePageBookmark(){ const a=lastArticleSnapshot||await getArticle(); const words=(a.text||"").split(/\s+/).filter(Boolean); const percent=Math.round((window.scrollY/Math.max(1,document.documentElement.scrollHeight-window.innerHeight))*100); const b={id:crypto.randomUUID(),articleId:a.id,title:a.title,url:a.url,position:percent,percent,createdAt:new Date().toISOString()}; const stored=await chrome.storage.local.get("bookmarks"); const list=Array.isArray(stored.bookmarks)?stored.bookmarks:[]; list.unshift(b); await chrome.storage.local.set({bookmarks:list}); cmjToast("✓ Reading position bookmarked"); }
  function updateReadingFocus(){ const root=document.querySelector("article,main,[role='main'],.post-content,.article-content,.entry-content")||document.body; const blocks=[...root.querySelectorAll("p,h1,h2,h3,h4,li,blockquote")].filter(x=>x.innerText?.trim()&&!toolbar.contains(x)); blocks.forEach(x=>x.classList.remove("cmj-reading-focus")); const mid=window.innerHeight*0.42; let best=null,bestDist=1e9; blocks.forEach(x=>{const r=x.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;const d=Math.abs((r.top+r.bottom)/2-mid);if(d<bestDist){bestDist=d;best=x;}}); if(best){best.classList.add("cmj-reading-focus"); best.scrollIntoView({block:"nearest"});} if(Date.now()-lastScrollSave>1200 && lastArticleSnapshot){lastScrollSave=Date.now(); chrome.storage.local.get("articles").then(({articles=[]})=>{const idx=articles.findIndex(x=>x.url===location.href||x.canonicalUrl===location.href);if(idx<0)return;const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);const percent=Math.round(window.scrollY/max*100);articles[idx].progress=percent;articles[idx].currentWord=Math.round((lastArticleSnapshot.wordCount||0)*percent/100);articles[idx].readingPosition={percent,word:articles[idx].currentWord,updatedAt:new Date().toISOString()};articles[idx].updatedAt=new Date().toISOString();chrome.storage.local.set({articles});});} }

  function showSelection() {
    if (!toolbarAllowedNow || !site || site.vocabulary === false || settings.vocabularyToolbarEnabled === false) return;
    const sel=window.getSelection(); const text=sel?.toString().trim();
    if (!text || text.length>1800 || !sel.rangeCount) return;
    selectedText=text; selectionRange=sel.getRangeAt(0).cloneRange(); q('#cmj-selected-text').textContent=text;
    toolbar.hidden=false; showPanel('vocabulary');
    if (settings.vocabularyAutoTranslate || site.autoTranslate) translate();
    if (settings.vocabularyAutoSave || site.autoSave) saveVocab();
  }

  // Reader capture keeps the source HTML separate from the reading UI so formatting can be
  // re-themed later without mutating the saved article.
  document.addEventListener('mousemove', e => {
    const word = e.target.closest?.('.cmj-word');
    if (word) {
      document.querySelectorAll('.cmj-word.cmj-pointer-word').forEach(x=>x.classList.remove('cmj-pointer-word'));
      word.classList.add('cmj-pointer-word');
    }
  }, true);
  document.addEventListener('mouseup',()=>setTimeout(showSelection,40),true);
  document.addEventListener('mousedown',e=>{if(!toolbar.contains(e.target)&&!window.getSelection()?.toString().trim()) hideAll(); manualScrollUntil=Date.now()+700;},true);
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "CMJ_GET_PAGE_DATA") {
      (async()=>{
        try { const a=await getArticle(); if(!a.text) throw Error("No readable article content found on this page."); sendResponse({ok:true,article:a}); }
        catch(e){ sendResponse({ok:false,error:e.message||"Unable to extract page data."}); }
      })();
      return true;
    }
    if (message?.type === "CMJ_START_NATIVE_READING") { startNativeReading(); sendResponse({ok:true}); return true; }
  });

  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.settings) refresh();});
  window.addEventListener('scroll',()=>{ if(Date.now()<manualScrollUntil)return; updateReadingFocus(); },{passive:true,capture:true});

  toolbar.addEventListener('click', async e => {
    const tool=e.target.closest('[data-tool]')?.dataset.tool; const action=e.target.closest('[data-action]')?.dataset.action;
    if(tool){
      try {
        if(tool==='close'){hideAll();return;}
        if(tool==='reader'){const currentArticle=await getArticle(); const r=await send('CMJ_OPEN_READER',{article:currentArticle,autoplay:false,mode:'reader'});if(!r?.ok)throw Error(r?.error||'Could not open Reader.');return;}
        if(tool==='night'){settings.dayNightMode=settings.dayNightMode==='night'?'day':'night';applyFocus();return;}
        showPanel(tool);
      } catch(err) {
        const message=String(err?.message||err);
        q('.cmj-result').hidden=false;
        q('.cmj-message').textContent=message.includes('reloaded or updated')
          ? 'Charlie MJ Reader was updated. Refresh this webpage, then open Reader Workspace again.'
          : message;
      }
      return;
    }
    if(!action) return;
    try {
      if(action==='translate') await translate();
      if(action==='meaning'){await translate(); q('.cmj-message').textContent='Contextual meaning uses the selected text and surrounding page context.';}
      if(action==='save') await saveVocab();
      if(action==='quote') await saveCapture('quote');
      if(action==='paragraph') await saveCapture('paragraph');
      if(action==='selection') await saveCapture('selection');
      if(action==='bookmark-page') await savePageBookmark();
      if(action==='copy') await navigator.clipboard.writeText(selectedText);
      if(action==='notes'){await navigator.clipboard.writeText(`${selectedText}\n${toolbar.dataset.translation||'[Add translation]'}\nSource: ${location.href}`);}
      if(action==='pronunciation'){q('.cmj-result').hidden=false;q('.cmj-message').textContent='Pronunciation can be added to the vocabulary entry; select a word and save it.';}
      if(action==='listen'){const r=await send('CMJ_OPEN_READER',{autoplay:true});if(!r?.ok)throw Error(r?.error||'Could not open reader.');}
      if(action==='media-play') playLocalMedia();
      if(action==='pause') pauseLocalMedia();
      if(action==='stop') stopLocalMedia();
      if(action==='focus-toggle'){settings.focusEnabled=!settings.focusEnabled;await chrome.storage.local.set({settings});applyFocus();applyAds();}
      if(action==='adblock'){settings.adBlockEnabled=!settings.adBlockEnabled;await chrome.storage.local.set({settings});applyAds();}
      if(action==='day'||action==='night'||action==='auto'){settings.dayNightMode=action;await chrome.storage.local.set({settings});applyFocus();}
      if(action==='pomodoro') startTimer('pomodoro'); if(action==='eighty') startTimer('8020'); if(action==='timer-stop') stopTimer();
      if(action==='focus-open'){showPanel('focus');}
      if(action==='native-read'){startNativeReading();}
      if(action==='native-stop'){clearInterval(nativeReadingTimer);clearTimeout(nativeReadingDelayTimer);clearNativeReading();}
    } catch(err){q('.cmj-message').textContent=err.message||'Action failed.';}
  });

  q('#cmj-media-speed').addEventListener('input',e=>q('#cmj-speed-value').textContent=`${e.target.value}×`);
  ['brightness','contrast','opacity'].forEach(k=>q('#cmj-'+k).addEventListener('input',async e=>{const key={brightness:'focusBrightness',contrast:'focusContrast',opacity:'focusOpacity'}[k];settings[key]=Number(e.target.value);await chrome.storage.local.set({settings});applyFocus();}));

  function startTimer(mode){stopTimer();timerMode=mode;timerPhase='work';const duration=()=>timerMode==='8020'?(timerPhase==='work'?80:20):(timerPhase==='work'?Number(q('#cmj-work').value||25):Number(q('#cmj-break').value||5));timerEnd=Date.now()+duration()*60000;timerInterval=setInterval(()=>{const left=Math.max(0,timerEnd-Date.now());q('#cmj-timer').textContent=`${timerMode==='8020'?'80/20':'Pomodoro'} · ${timerPhase==='work'?'Focus':'Break'} · ${Math.ceil(left/1000)}s`;if(left<=0){timerPhase=timerPhase==='work'?'break':'work';timerEnd=Date.now()+duration()*60000;}},500);}
  function stopTimer(){clearInterval(timerInterval);timerInterval=null;q('#cmj-timer').textContent='Ready';timerMode='';timerPhase='work';}

  const adObserver=new MutationObserver(()=>{if(site?.focus!==false)applyAds();}); adObserver.observe(document.documentElement,{childList:true,subtree:true});
  refresh();
})();
