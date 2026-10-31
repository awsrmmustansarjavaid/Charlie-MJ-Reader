import { getAll } from "../lib/storage.js";
const data=await getAll();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const articleId=new URLSearchParams(location.search).get("articleId");
const belongs=x=>!articleId||(x.articleId===articleId||x.sourceArticleId===articleId);
const groups=[
 ["Saved Paragraphs & Lines",(data.paragraphs||[]).filter(belongs)], ["Saved Words",(data.vocabulary||[]).filter(belongs)],
 ["Saved Quotes",(data.quotes||[]).filter(belongs)], ["Highlights",(data.highlights||[]).filter(belongs)],
 ["Personal Notes",(data.notes||[]).filter(belongs)], ["Reading Position Bookmarks",(data.bookmarks||[]).filter(belongs)],
 ["Saved Selections",(data.selections||[]).filter(belongs)]
];
const root=document.getElementById("saved-content");
if(!articleId){
 const countsFor=a=>groups.map(([name,items])=>({name,count:items.filter(x=>x.articleId===a.id||x.sourceArticleId===a.id).length})).filter(x=>x.count);
 const cards=(data.articles||[]).map(a=>{const counts=countsFor(a),total=counts.reduce((n,x)=>n+x.count,0);return `<a class="saved-article-card" href="saved.html?articleId=${encodeURIComponent(a.id)}"><div class="saved-article-thumb">${a.thumbnail||a.image?`<img src="${esc(a.thumbnail||a.image)}" alt="">`:`<span>▤</span>`}</div><div><h2>${esc(a.title||"Untitled article")}</h2><p>${esc(a.siteName||a.domain||a.url||"")}</p><strong>${total} saved item(s)</strong><div class="saved-count-grid">${counts.map(c=>`<span>${esc(c.name)} <b>${c.count}</b></span>`).join("")||"<span>No saved items yet</span>"}</div></div></a>`;}).join("");
 root.innerHTML=`<div class="saved-article-grid">${cards||'<p class="muted">No saved articles yet. Save an article and its captured items will appear here.</p>'}</div>`;
} else {
 const a=(data.articles||[]).find(x=>x.id===articleId);const h=document.createElement("h1");h.textContent=`Saved items${a?` — ${a.title||"Article"}`:""}`;root.before(h);
 root.innerHTML=groups.map(([heading,items])=>`<section class="saved-group"><h2>${heading} <small>(${items.length})</small></h2>${items.length?`<div class="list">${items.map(x=>`<article class="item"><div><h3>${esc(x.title||x.word||x.text||x.note||"Saved item")}</h3><p>${esc(x.text||x.definition||x.note||x.translation||"")}</p><p class="muted">${esc(x.siteName||x.domain||x.url||x.createdAt||"")}</p></div></article>`).join("")}</div>`:`<p class="muted">Nothing saved here yet.</p>`}</section>`).join("");
}

// Button feedback on the standalone See Saved page.
document.addEventListener("click", event => { const b=event.target.closest("button"); if(!b) return; const n=data.settings?.notifications||{}; if(n.enabled===false||n.events?.action===false) return; let host=document.getElementById("cmj-toast-host"); if(!host){host=document.createElement("div");host.id="cmj-toast-host";document.body.append(host);} host.dataset.position=["top-left","top-right","bottom-left","bottom-right"].includes(n.position)?n.position:"bottom-right"; const t=document.createElement("div");t.className="cmj-toast cmj-toast-ok";t.textContent=`${(b.textContent||"Action").trim().slice(0,48)} clicked`;host.append(t);setTimeout(()=>t.remove(),Number(n.durationMs||2600));},{capture:true});
