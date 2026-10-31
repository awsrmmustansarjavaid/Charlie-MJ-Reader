/**
 * Small storage adapter. Chrome storage is used in-extension; localStorage
 * provides a predictable fallback for opening the UI outside Chrome.
 */
export const defaults = {
  articles: [], highlights: [], notes: [], vocabulary: [], quotes: [], paragraphs: [], selections: [], categories: [], bookmarks: [],
  collections: [], topics: [],
  settings: {
    theme: "dark", vocabularyToolbarEnabled: true, vocabularySites: ["eksisozluk.com", "x.com", "twitter.com"],
    translationSource: "tr", translationTarget: "en", dictionaryLanguage: "en", accent: "#8b7cff", fontSize: 18, readingWidth: 760,
    lineHeight: 1.75, toolbarEnabled: true, mainToolbarVisibility: "supported_and_library", toolbarPosition: "top", toolbarOpacity: 92,
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
    mediumAdapterDiagnostics: true, mediumAdapterConfirm: true, mediumAdapterReplace: true, adapterMaxPackageMB: 25, adapterMaxFiles: 500,
    libraryAutoCategory: true, libraryAllowManualCategory: true, libraryFetchCompleteArticle: true, libraryFetchSeoOnSave: true, articleGoogleAuditOnSave: true, libraryDefaultArticleCategory: "General", libraryCustomCategories: ["Tech","Health","Science","Business","Lifestyle","Education","Sports","Entertainment","Social","News","General"], libraryAutoTags: true, libraryAutoLabels: true,
    intelligenceEnabled: true, intelligenceUsePublisherRules: true, intelligenceUseKeywordScoring: true, intelligenceMinConfidence: 0.6, intelligenceAutoCategoryArticles: true, intelligenceLearnFromEdits: true,
    notifications: { enabled: true, position: "bottom-right", durationMs: 2600, events: { bookmark: true, article: true, vocabulary: true, quote: true, paragraph: true, selection: true, opened: true, completed: true, restored: true, export: true, error: true } },
  },
  adapterPackages: [],
  readingHistory: [], deleted: [],
  readingLibrary: { version: 1, categories: {}, websiteData: {} },
  articleLibrary: { version: 1, linkedToSavedArticles: true },
  readingEngine: { version: 1 }
};

function cloneDefaults() {
  return structuredClone(defaults);
}

function mergeData(stored) {
  const source = stored && typeof stored === "object" ? stored : {};
  const storedSettings = source.settings && typeof source.settings === "object" ? source.settings : {};
  const storedNotifications = storedSettings.notifications && typeof storedSettings.notifications === "object"
    ? storedSettings.notifications
    : {};
  const storedEvents = storedNotifications.events && typeof storedNotifications.events === "object"
    ? storedNotifications.events
    : {};

  const data = { ...cloneDefaults(), ...source };
  data.settings = { ...defaults.settings, ...storedSettings };
  data.settings.notifications = { ...defaults.settings.notifications, ...storedNotifications };
  data.settings.notifications.events = { ...defaults.settings.notifications.events, ...storedEvents };
  return data;
}

export async function getAll() {
  if (globalThis.chrome && chrome.storage && chrome.storage.local) {
    const stored = await chrome.storage.local.get(null);
    return mergeData(stored);
  }
  try {
    const stored = JSON.parse(localStorage.getItem("cmj-data") || "{}");
    return mergeData(stored);
  } catch {
    return cloneDefaults();
  }
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
