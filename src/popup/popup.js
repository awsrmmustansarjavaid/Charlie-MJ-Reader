import { getAll, saveAll } from "../lib/storage.js";
import { exportBackup } from "../lib/export.js";

// Keep popup controls and counters small, predictable, and easy to maintain.
const $ = (id) => document.getElementById(id);
const data = await getAll();
let currentText = "";
let utterance = null;
let wordCount = 0;
let spokenWords = 0;
let playbackState = "idle";

$("article-count").textContent = data.articles.length;
$("highlight-count").textContent = data.highlights.length;
$("word-count").textContent = data.vocabulary.length;
const toast = (message) => { $("toast").textContent = message; };

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active browser tab was found.");
  return tab;
}

function updateMedia(position = spokenWords, status = playbackState) {
  const percent = wordCount ? Math.min(100, Math.round((position / wordCount) * 100)) : 0;
  $("media-toolbar").hidden = false;
  $("media-progress").style.width = `${percent}%`;
  $("media-percent").textContent = `${percent}%`;
  $("media-position").textContent = `${position} / ${wordCount} words`;
  $("media-status").textContent = status === "playing" ? "Playing" : status === "paused" ? "Paused" : status === "stopped" ? "Stopped" : "Ready";
}

function stopReading() {
  window.speechSynthesis.cancel();
  utterance = null;
  playbackState = "stopped";
  spokenWords = 0;
  updateMedia(0, "stopped");
}

function playReading() {
  if (!currentText) return;
  if (playbackState === "paused" && window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    playbackState = "playing";
    updateMedia();
    return;
  }
  window.speechSynthesis.cancel();
  utterance = new SpeechSynthesisUtterance(currentText);
  utterance.rate = 1;
  utterance.onstart = () => { playbackState = "playing"; updateMedia(); };
  utterance.onboundary = (event) => {
    if (event.name !== "word") return;
    spokenWords = currentText.slice(0, event.charIndex).trim().split(/\s+/).filter(Boolean).length;
    updateMedia();
  };
  utterance.onend = () => { playbackState = "stopped"; spokenWords = wordCount; updateMedia(wordCount, "stopped"); };
  utterance.onerror = () => { playbackState = "stopped"; updateMedia(spokenWords, "stopped"); };
  playbackState = "playing";
  window.speechSynthesis.speak(utterance);
  updateMedia();
}

async function startReadingCurrentPage() {
  try {
    const tab = await activeTab();
    const response = await chrome.tabs.sendMessage(tab.id, {type:"CMJ_GET_PAGE_DATA"});
    if (!response?.ok || !response.article?.text) throw new Error(response?.error || "No readable text is available on this page.");
    currentText = String(response.article.text).trim();
    wordCount = currentText.split(/\s+/).filter(Boolean).length;
    spokenWords = 0;
    $("media-toolbar").hidden = false;
    playReading();
    toast("Reading toolbar is ready. Use Play, Pause, or Stop below.");
  } catch (error) {
    toast(error.message || "This page cannot be read aloud.");
  }
}

$("save-page").addEventListener("click", async () => {
  try {
    const tab = await activeTab();
    const response = await chrome.tabs.sendMessage(tab.id, {type:"CMJ_GET_PAGE_DATA"});
    if (!response?.ok || !response.article?.text) throw new Error(response?.error || "No readable article text was found.");
    const result = response.article;
    const latest = await getAll();
    if (!latest.articles.some((article) => article.url === result.url)) latest.articles.unshift(result);
    await saveAll(latest);
    toast("Article saved to your library.");
  } catch (error) {
    toast(error.message || "This page cannot be captured. Open a regular article tab.");
  }
});

$("open-reader").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("src/reader/reader.html") }));
$("open-library").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("src/reader/reader.html#library") }));
$("open-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("export-backup").addEventListener("click", async () => exportBackup(await getAll()));
$("listen").addEventListener("click", startReadingCurrentPage);
$("media-play").addEventListener("click", playReading);
$("media-pause").addEventListener("click", () => {
  if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
    window.speechSynthesis.pause(); playbackState = "paused"; updateMedia();
  }
});
$("media-stop").addEventListener("click", stopReading);
window.addEventListener("beforeunload", () => window.speechSynthesis.cancel());
