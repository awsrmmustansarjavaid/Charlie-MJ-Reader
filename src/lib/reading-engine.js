/* Shared Reading Engine v1 — loaded by the content script and reusable by page features. */
(() => {
  if (globalThis.CMJReadingEngine) return;
  globalThis.CMJReadingEngine = {
    words(text){ return String(text||'').trim().split(/\s+/).filter(Boolean); },
    sentences(text){ return (String(text||'').match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)||[]).map(x=>x.trim()).filter(Boolean); },
    progress(word,total){ return total ? Math.max(0,Math.min(100,Math.round(word/total*100))) : 0; },
    position(article){ const total=article?.wordCount||this.words(article?.text).length; return {word:Math.max(0,Math.min(total,Number(article?.currentWord||0))), total, percent:Number(article?.progress||0)}; },
    selection(type,text,article,extra={}){ return {id:crypto.randomUUID(),type,text:String(text||'').trim(),articleId:article?.id||null,title:article?.title||'',url:article?.url||'',domain:article?.domain||'',siteName:article?.siteName||article?.domain||'',category:article?.category||'General',tags:article?.tags||[],labels:article?.labels||[],createdAt:new Date().toISOString(),...extra}; }
  };
})();
