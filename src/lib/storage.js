/**
 * Small storage adapter. Chrome storage is used in-extension; localStorage
 * provides a predictable fallback for opening the UI outside Chrome.
 */
const defaults = {
  articles: [], highlights: [], notes: [], vocabulary: [], bookmarks: [],
  collections: [], topics: [], settings: {
    theme: "dark", accent: "#8b7cff", fontSize: 18, readingWidth: 760,
    lineHeight: 1.75, toolbarEnabled: true, toolbarPosition: "right",
    ttsRate: 1, ttsPitch: 1, audioHighlightMode: "combined", audioAutoScroll: true, audioVoiceURI: "", aiProvider: "openai-compatible", aiEndpoint: "",
    aiModel: "", aiKey: "", aiConsent: false, mediumAlerts: true
  },
  readingHistory: [], deleted: []
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
