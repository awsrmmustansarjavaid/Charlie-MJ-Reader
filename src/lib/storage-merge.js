/**
 * @file Three-way merge used whenever a page saves data that other pages may
 * have changed in the meantime.
 *
 * Problem this solves: a page loads storage once, the user saves a website in
 * the popup, and the page later writes its old copy back, erasing the new
 * website. Instead of overwriting, every save merges three versions:
 *
 *   base  - what this page loaded (or last saved),
 *   local - what this page holds now,
 *   fresh - what storage holds right now (includes other pages' saves).
 *
 * Rule: a change this page made on purpose wins; everything else comes from
 * `fresh`, so records saved elsewhere are never lost.
 */
import { matchKeys, siteKey } from "./record-matching.js";

/** Settings keys that hold website lists and need record-level merging. */
const WEBSITE_LIST_KEY = "websites";

/**
 * Serialise with sorted keys so equal values compare equal.
 * @param {unknown} value Any JSON value.
 * @returns {string} Canonical JSON.
 */
export function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

/** Deep copy of JSON data. */
export const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * Three-way merge of two record lists.
 * @param {unknown[]} fresh Records in storage now.
 * @param {unknown[]} local Records this page holds.
 * @param {unknown[]} base Records this page loaded.
 * @param {(record: unknown) => string[]} [keysOf] Returns the identity keys of a record.
 * @returns {unknown[]} Merged list (order: fresh first, then new local records).
 */
export function mergeRecordLists(fresh = [], local = [], base = [], keysOf = matchKeys) {
    const primary = (record) => keysOf(record)[0];
    const baseByKey = new Map(base.map((record) => [primary(record), record]));
    const localByKey = new Map(local.map((record) => [primary(record), record]));
    const result = [];
    const placed = new Set();

    for (const record of fresh) {
        const key = primary(record);
        const mine = localByKey.get(key);
        const original = baseByKey.get(key);
        if (original !== undefined && mine === undefined) continue;          // deleted on purpose in this page
        if (mine !== undefined && original !== undefined && canonical(mine) !== canonical(original)) result.push(mine); // edited here
        else result.push(record);                                            // untouched here: keep storage's version
        placed.add(key);
    }
    for (const record of local) {                                            // added here, not yet in storage
        const key = primary(record);
        if (!placed.has(key)) { result.push(record); placed.add(key); }
    }
    return result;
}

/**
 * Per-key three-way merge of plain objects.
 * @param {object} fresh Object in storage now.
 * @param {object} local Object this page holds.
 * @param {object} base Object this page loaded.
 * @param {Record<string, (fresh: unknown, local: unknown, base: unknown) => unknown>} [special] Custom mergers by key.
 * @returns {object} Merged object.
 */
export function mergeObjectKeys(fresh = {}, local = {}, base = {}, special = {}) {
    const result = { ...fresh };
    for (const key of new Set([...Object.keys(local), ...Object.keys(base)])) {
        const inLocal = key in local;
        if (special[key]) { result[key] = special[key](fresh[key], local[key], base[key]); continue; }
        if (!inLocal) { delete result[key]; continue; }                      // removed on purpose here
        if (!(key in base) || canonical(local[key]) !== canonical(base[key])) result[key] = local[key]; // changed here
    }
    return result;
}

/** Website identity keys: normalised host only. */
const websiteKeys = (site) => [`site:${siteKey(site)}`];

/** Library sub-structure mergers (profiles, favourites and per-site data). */
const LIBRARY_MERGERS = {
    profiles: (fresh, local, base) => mergeRecordLists(fresh || [], local || [], base || []),
    favorites: (fresh, local, base) => mergeRecordLists((fresh || []).map((d) => ({ domain: d })), (local || []).map((d) => ({ domain: d })), (base || []).map((d) => ({ domain: d })), websiteKeys).map((x) => x.domain),
    websiteData: (fresh, local, base) => mergeObjectKeys(fresh || {}, local || {}, base || {}),
    categories: (fresh, local, base) => mergeObjectKeys(fresh || {}, local || {}, base || {})
};

/**
 * Merge the settings object; the websites list is merged by normalised domain.
 * @param {object} fresh Settings in storage now.
 * @param {object} local Settings this page holds.
 * @param {object} base Settings this page loaded.
 * @returns {object} Merged settings.
 */
export function mergeSettings(fresh = {}, local = {}, base = {}) {
    return mergeObjectKeys(fresh, local, base, {
        [WEBSITE_LIST_KEY]: (f, l, b) => mergeRecordLists(f || [], l || [], b || [], websiteKeys)
    });
}

/**
 * Compute the minimal storage patch for a save: only keys this page actually
 * changed, each merged against what storage holds now.
 * @param {object} fresh Full storage contents now.
 * @param {object} local Data this page holds.
 * @param {object} base Data this page loaded or last saved.
 * @returns {object} Patch to pass to `chrome.storage.local.set`.
 */
export function computeStoragePatch(fresh, local, base) {
    const patch = {};
    for (const key of Object.keys(local)) {
        if (canonical(local[key]) === canonical(base?.[key])) continue;      // untouched by this page
        if (key === "settings") patch.settings = mergeSettings(fresh.settings, local.settings, base?.settings);
        else if (key === "readingLibrary") patch.readingLibrary = mergeObjectKeys(fresh.readingLibrary, local.readingLibrary, base?.readingLibrary, LIBRARY_MERGERS);
        else if (Array.isArray(local[key])) patch[key] = mergeRecordLists(fresh[key] || [], local[key], base?.[key] || []);
        else patch[key] = local[key];
    }
    return patch;
}
