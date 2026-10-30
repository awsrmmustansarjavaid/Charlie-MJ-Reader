import { getAll } from "../lib/storage.js";
const data=await getAll();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const articleId=new URLSearchParams(location.search).get("articleId");
const belongs=x=>!articleId||x.articleId===articleId;
const groups=[
 ["Saved Paragraphs & Lines",(data.paragraphs||[]).filter(belongs)], ["Saved Words",(data.vocabulary||[]).filter(belongs)],
 ["Saved Quotes",(data.quotes||[]).filter(belongs)], ["Highlights",(data.highlights||[]).filter(belongs)],
 ["Personal Notes",(data.notes||[]).filter(belongs)], ["Reading Position Bookmarks",(data.bookmarks||[]).filter(belongs)],
 ["Saved Selections",(data.selections||[]).filter(belongs)]
];
const root=document.getElementById("saved-content");
if(articleId){const a=(data.articles||[]).find(x=>x.id===articleId);const h=document.createElement("h1");h.textContent=`Saved items${a?` — ${a.title||"Article"}`:""}`;root.before(h);}
root.innerHTML=groups.map(([heading,items])=>`<section class="saved-group"><h2>${heading} <small>(${items.length})</small></h2>${items.length?`<div class="list">${items.map(x=>`<article class="item"><div><h3>${esc(x.title||x.word||x.text||x.note||"Saved item")}</h3><p>${esc(x.text||x.definition||x.note||x.translation||"")}</p><p class="muted">${esc(x.siteName||x.domain||x.url||x.createdAt||"")}</p></div></article>`).join("")}</div>`:`<p class="muted">Nothing saved here yet.</p>`}</section>`).join("");

// Button feedback on the standalone See Saved page.
document.addEventListener("click", event => { const b=event.target.closest("button"); if(!b) return; const n=data.settings?.notifications||{}; if(n.enabled===false||n.events?.action===false) return; let host=document.getElementById("cmj-toast-host"); if(!host){host=document.createElement("div");host.id="cmj-toast-host";document.body.append(host);} host.dataset.position=["top-left","top-right","bottom-left","bottom-right"].includes(n.position)?n.position:"bottom-right"; const t=document.createElement("div");t.className="cmj-toast cmj-toast-ok";t.textContent=`${(b.textContent||"Action").trim().slice(0,48)} clicked`;host.append(t);setTimeout(()=>t.remove(),Number(n.durationMs||2600));},{capture:true});
