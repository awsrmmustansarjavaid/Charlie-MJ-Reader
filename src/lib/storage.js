/**
 * Small storage adapter. Chrome storage is used in-extension; localStorage
 * provides a predictable fallback for opening the UI outside Chrome.
 */
const defaults = {
  articles: [], highlights: [], notes: [], vocabulary: [], categories: [], bookmarks: [],
  collections: [], topics: [],
  settings: {
    theme: "dark", vocabularyToolbarEnabled: true, vocabularySites: ["eksisozluk.com", "x.com", "twitter.com"],
    translationSource: "tr", translationTarget: "en", dictionaryLanguage: "en", accent: "#8b7cff", fontSize: 18, readingWidth: 760,
    lineHeight: 1.75, toolbarEnabled: true, toolbarPosition: "top", toolbarOpacity: 92,
    toolbarModules: { reader: true, vocabulary: true, media: true, focus: true, productivity: true },
    toolbarThemes: { main: "midnight", media: "midnight", vocabulary: "violet", productivity: "focus" },
    toolbarType: "floating",
    toolbarTypes: ["floating","navbar","sidebar","right-sidebar","bottom-navbar","bubble"],
    mediaToolbarEnabled: true, mediaAutoPlay: false, mediaSpeed: 1, mediaVolume: 1,
    vocabularyToolbarPosition: "selection", vocabularyAutoTranslate: false, vocabularyAutoSave: false,
    vocabularyShowMeaning: true, vocabularyShowPronunciation: true, vocabularyShowNotes: true,
    focusEnabled: false, adBlockEnabled: true, dayNightMode: "day", focusBrightness: 100, focusContrast: 100, focusOpacity: 100,
    focusDimBackground: false, focusBlur: 0, focusWarmth: 0, focusFontScale: 100, focusHideImages: false,
    productivityToolbarEnabled: true, pomodoroEnabled: true, pomodoroWork: 25, pomodoroBreak: 5, pomodoroLongBreak: 15,
    nativeReadingEnabled: true, nativeReadingTimer: 10, nativeReadingDelay: 0, nativeHighlightWordColor: "orange", nativeHighlightLineColor: "purple", nativeCurrentWordBold: true, nativeReadingAutoStart: false,
    eightyTwentyEnabled: true, eightyTwentyRatio: 80, productivityPosition: "top-right",
    websites: [
      {domain:"eksisozluk.com",version:1,enabled:true,toolbar:true,vocabulary:true,media:true,focus:true,productivity:true,autoTranslate:false,autoSave:false,nativeReading:true,position:"top",toolbarType:"floating",toolbarTheme:"midnight",category:"General",tags:[],updatedAt:new Date().toISOString()},
      {domain:"x.com",version:1,enabled:true,toolbar:true,vocabulary:true,media:true,focus:true,productivity:true,autoTranslate:false,autoSave:false,nativeReading:true,position:"top",toolbarType:"floating",toolbarTheme:"midnight",category:"General",tags:[],updatedAt:new Date().toISOString()},
      {domain:"twitter.com",version:1,enabled:true,toolbar:true,vocabulary:true,media:true,focus:true,productivity:true,autoTranslate:false,autoSave:false,nativeReading:true,position:"top",toolbarType:"floating",toolbarTheme:"midnight",category:"General",tags:[],updatedAt:new Date().toISOString()},
      {domain:"medium.com",version:1,enabled:true,toolbar:true,vocabulary:true,media:true,focus:true,productivity:true,nativeReading:true,autoTranslate:false,autoSave:false,position:"top",toolbarType:"floating",toolbarTheme:"midnight",category:"Medium",tags:["medium"],updatedAt:new Date().toISOString()}
    ],
    ttsRate: 1, ttsPitch: 1, audioHighlightMode: "combined", audioAutoScroll: true, audioVoiceURI: "", aiProvider: "openai-compatible", aiEndpoint: "",
    aiModel: "", aiKey: "", aiConsent: false,
    mediumAlerts: true, mediumEnabled: true, mediumDetectUrls: true, mediumUseCanonical: true, mediumAutoSave: false,
    mediumMonitor: true, mediumExtractMetadata: true, mediumExtractPublication: true, mediumExtractImages: true,
    mediumExtractCanonical: true, mediumExtractContent: true, freediumEnabled: true, freediumAutoOpen: true,
    freediumMediaButton: true, freediumFallback: true, freediumNewTab: true,
    freediumServiceUrl: "https://freedium-mirror.cfd/", mediumAdapterEnabled: true, mediumUserAdapters: true,
    mediumAdapterDiagnostics: true, mediumAdapterConfirm: true, mediumAdapterReplace: true, adapterMaxPackageMB: 25, adapterMaxFiles: 500
  },
  adapterPackages: [],
  readingHistory: [], deleted: [],
  readingLibrary: { version: 1, categories: {}, websiteData: {} }
};

export async function getAll() {
  if (globalThis.chrome?.storage?.local) {
    const stored = await chrome.storage.local.get(null);
    return { ...structuredClone(defaults), ...stored,
      settings: { ...defaults.settings, ...(stored.settings || {}) } };
  }
  try {
    return { ...structuredClone(defaults), ...JSON.parse(localStorage.getItem("cmj-data") || "{}") };
  } catch { return structuredClone(defaults); }
}

export async function saveAll(data) {
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set(data);
  } else {
    localStorage.setItem("cmj-data", JSON.stringify(data));
  }
  return data;
}

export async function updateSection(section, updater) {
  const data = await getAll();
  data[section] = typeof updater === "function" ? updater(data[section] || []) : updater;
  await saveAll(data);
  return data[section];
}

export async function updateSettings(patch) {
  const data = await getAll();
  data.settings = { ...data.settings, ...patch };
  await saveAll(data);
  return data.settings;
}

export function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
