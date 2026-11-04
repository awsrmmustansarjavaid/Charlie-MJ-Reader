/**
 * @file Record identity, duplicate detection and recency rules shared by the
 * GitHub sync, the settings page and the library.
 *
 * The same website or article can arrive with different ids, a "www." prefix,
 * a trailing slash or tracking parameters. Matching therefore uses several
 * normalised keys instead of one raw identifier.
 */

/** Query parameters that never change which page a URL points to. */
const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref|ref_src|source|spm|yclid|_hsenc|_hsmi)$/i;

/** Field names that may hold a modification time, newest convention first. */
const TIMESTAMP_FIELDS = Object.freeze(["updatedAt", "modifiedAt", "updated", "lastModified"]);

/** Field names tried, in order, when naming a record in summaries. */
const LABEL_FIELDS = Object.freeze(["title", "name", "word", "text", "domain", "url", "id"]);

/**
 * Normalise a URL or bare domain for comparison: lower-case host, no scheme,
 * no "www.", no tracking parameters, no fragment, no trailing slash.
 * @param {string} value URL, domain, or domain/path.
 * @returns {string} Comparable key, or "" when the value is empty or unparsable.
 */
export function normalizeUrlKey(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    try {
        const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
        const params = [...url.searchParams.entries()]
            .filter(([name]) => !TRACKING_PARAMS.test(name))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, val]) => `${name}=${val}`);
        const host = url.hostname.toLowerCase().replace(/^www\./, "");
        const path = url.pathname.replace(/\/+$/, "");
        return `${host}${path}${params.length ? `?${params.join("&")}` : ""}`;
    } catch {
        return text.toLowerCase();
    }
}

/**
 * Normalised identity of a website record (string or object).
 * Websites are matched on host (plus path for sub-site entries), never on ids.
 * @param {string|{domain?: string, url?: string}} site Website entry.
 * @returns {string} Normalised key such as "example.com".
 */
export function siteKey(site) {
    const raw = typeof site === "string" ? site : site?.domain || site?.url || "";
    return normalizeUrlKey(raw);
}

/**
 * All keys that can identify a record, strongest first: id, normalised URL,
 * normalised domain, then title + date. Two records are the same when any key matches.
 * @param {unknown} record Collection record.
 * @returns {string[]} Match keys (never empty).
 */
export function matchKeys(record) {
    if (record === null || typeof record !== "object") return [`value:${JSON.stringify(record)}`];
    const keys = [];
    if (record.id) keys.push(`id:${record.id}`);
    const url = normalizeUrlKey(record.url || record.link || "");
    if (url) keys.push(`url:${url}`);
    const domain = normalizeUrlKey(record.domain || "");
    if (domain && !record.url) keys.push(`domain:${domain}`);
    if (record.word) keys.push(`word:${String(record.word).toLowerCase()}|${record.language || record.lang || ""}`);
    if (record.title) {
        const date = String(record.publishedAt || record.datePublished || record.date || record.createdAt || "").slice(0, 10);
        keys.push(`td:${String(record.title).trim().toLowerCase()}|${date}`);
    }
    if (!keys.length) keys.push(`json:${JSON.stringify(record)}`);
    return keys;
}

/**
 * Display name of a record for summaries and conflict lists.
 * @param {unknown} record Collection record.
 * @returns {string} Short readable name.
 */
export function recordLabel(record) {
    if (record === null || typeof record !== "object") return String(record);
    for (const field of LABEL_FIELDS) if (record[field]) return String(record[field]).slice(0, 80);
    return "(unnamed record)";
}

/**
 * Modification time of a record in milliseconds, or 0 when it has none.
 * @param {unknown} record Collection record.
 * @returns {number} Epoch milliseconds, or 0.
 */
export function timestampOf(record) {
    if (!record || typeof record !== "object") return 0;
    for (const field of TIMESTAMP_FIELDS) {
        const value = record[field];
        const time = typeof value === "number" ? value : Date.parse(value);
        if (Number.isFinite(time) && time > 0) return time;
    }
    return 0;
}

/**
 * Build a lookup from every match key to its record index.
 * @param {unknown[]} records Records to index.
 * @returns {Map<string, number>} Key to index.
 */
export function buildKeyIndex(records) {
    const index = new Map();
    records.forEach((record, position) => {
        for (const key of matchKeys(record)) if (!index.has(key)) index.set(key, position);
    });
    return index;
}

/**
 * Find the position of the record matching `record`, or -1.
 * @param {Map<string, number>} index Index from {@link buildKeyIndex}.
 * @param {unknown} record Record to look up.
 * @returns {number} Matching position or -1.
 */
export function findMatch(index, record) {
    for (const key of matchKeys(record)) if (index.has(key)) return index.get(key);
    return -1;
}

/**
 * Pair up two record lists by identity.
 * Duplicates inside one list collapse onto their first occurrence.
 * @param {unknown[]} remote GitHub records.
 * @param {unknown[]} local Local records.
 * @returns {{pairs: {remote: unknown, local: unknown}[], missing: unknown[], extra: unknown[], remoteCount: number, localCount: number}} Pairing.
 */
export function matchRecords(remote, local) {
    const uniqueRemote = [];
    const remoteIndex = new Map();
    for (const record of remote) {
        if (findMatch(remoteIndex, record) !== -1) continue;
        matchKeys(record).forEach((key) => { if (!remoteIndex.has(key)) remoteIndex.set(key, uniqueRemote.length); });
        uniqueRemote.push(record);
    }
    const uniqueLocal = [];
    const localIndex = new Map();
    for (const record of local) {
        if (findMatch(localIndex, record) !== -1) continue;
        matchKeys(record).forEach((key) => { if (!localIndex.has(key)) localIndex.set(key, uniqueLocal.length); });
        uniqueLocal.push(record);
    }
    const used = new Set();
    const pairs = [];
    const missing = [];
    for (const record of uniqueRemote) {
        const position = findMatch(localIndex, record);
        if (position === -1 || used.has(position)) missing.push(record);
        else { used.add(position); pairs.push({ remote: record, local: uniqueLocal[position] }); }
    }
    const extra = uniqueLocal.filter((_, position) => !used.has(position));
    return { pairs, missing, extra, remoteCount: uniqueRemote.length, localCount: uniqueLocal.length };
}
