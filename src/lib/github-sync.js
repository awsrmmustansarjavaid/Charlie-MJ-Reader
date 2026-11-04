/**
 * @file GitHub <-> local database synchronisation for Charlie MJ Reader.
 *
 * Browser extensions cannot run the `git` binary, so "pull" is implemented
 * through GitHub's HTTP API: the remote `database/` tree is listed, changed
 * files are downloaded, and their records are merged into local extension
 * storage under strict protection rules (see {@link planPull}).
 *
 * The module is DOM-free and receives `fetch` by injection, so it can be unit
 * tested in Node and reused from any extension page.
 */

import { buildKeyIndex, findMatch, matchKeys, matchRecords, normalizeUrlKey, recordLabel, siteKey, timestampOf } from "./record-matching.js";

/** Default repository used when the user has not configured one. */
export const DEFAULT_GITHUB_REPOSITORY_URL = "https://github.com/awsrmmustansarjavaid/Charlie-MJ-Reader";

/** Default branch used when none is configured. */
export const DEFAULT_GITHUB_BRANCH = "main";

/** Root directory of the database inside the repository. */
export const DATABASE_ROOT = "database/";

/** Sub-directory that holds the reading library. */
export const LIBRARY_ROOT = "database/My Reading Library/";

/** Settings that must never leave the device or be overwritten by a pull. */
const LOCAL_ONLY_SETTING_KEYS = Object.freeze([
    "githubToken", "githubUser", "githubRepo", "githubRepoUrl", "githubBranch", "localDatabaseFolderName"
]);

/** Settings that are secrets and must also be excluded from exports and comparisons. */
const SECRET_SETTING_KEYS = Object.freeze(["githubToken"]);

/** Core collections stored one-per-file under `database/Core/`. */
const CORE_COLLECTIONS = Object.freeze([
    "articles", "highlights", "notes", "vocabulary", "bookmarks",
    "collections", "topics", "readingHistory", "categories"
]);

/** Maximum field-level differences stored per record (keeps reports bounded). */
const MAX_FIELD_DIFFS_PER_RECORD = 50;

/** Maximum characters of a value stored in a difference entry. */
const MAX_VALUE_PREVIEW = 300;

/** Number of pre-pull backups retained in extension storage. */
const MAX_BACKUPS = 3;

/** Storage key for pre-pull backups. */
const BACKUP_STORAGE_KEY = "cmjPrePullBackups";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

/**
 * Parse a GitHub repository reference.
 * Accepts `https://github.com/owner/repo`, `.git` URLs and `owner/repo`.
 * @param {string} value User supplied URL or `owner/repo`.
 * @returns {{owner: string, repo: string}|null} Parsed parts, or null if invalid.
 */
export function parseGithubRepository(value) {
    const text = String(value || "").trim().replace(/\.git$/i, "").replace(/\/+$/, "");
    const match = text.match(/^(?:https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]+)$/);
    return match ? { owner: match[1], repo: match[2] } : null;
}

/**
 * Resolve the effective sync configuration from saved settings, falling back
 * to the default repository when nothing valid is saved.
 * @param {object} [settings] Extension settings object.
 * @returns {{owner: string, repo: string, branch: string, token: string, url: string}}
 */
export function resolveSyncConfig(settings = {}) {
    const fromUrl = parseGithubRepository(settings.githubRepoUrl);
    const legacy = settings.githubUser && settings.githubRepo
        ? { owner: settings.githubUser, repo: settings.githubRepo } : null;
    const target = fromUrl || legacy || parseGithubRepository(DEFAULT_GITHUB_REPOSITORY_URL);
    return {
        owner: target.owner,
        repo: target.repo,
        branch: (settings.githubBranch || DEFAULT_GITHUB_BRANCH).trim(),
        token: settings.githubToken || "",
        url: `https://github.com/${target.owner}/${target.repo}`
    };
}

/**
 * Return a copy of the settings that is safe to export, compare or upload:
 * secrets and device-specific values are removed.
 * @param {object} [settings] Extension settings.
 * @returns {object} Sanitised settings.
 */
export function sanitizeSettingsForSync(settings = {}) {
    const clean = { ...settings };
    for (const key of [...SECRET_SETTING_KEYS, ...LOCAL_ONLY_SETTING_KEYS]) delete clean[key];
    return clean;
}

/* ------------------------------------------------------------------ */
/* GitHub client                                                       */
/* ------------------------------------------------------------------ */

/** Error raised for GitHub/network failures with a user-readable message. */
export class GitHubSyncError extends Error {
    /**
     * @param {string} message Readable explanation.
     * @param {{status?: number, cause?: unknown}} [details] Extra context.
     */
    constructor(message, details = {}) {
        super(message);
        this.name = "GitHubSyncError";
        this.status = details.status ?? 0;
        this.cause = details.cause;
    }
}

/** Minimal GitHub REST client limited to the calls this feature needs. */
export class GitHubClient {
    /**
     * @param {{owner: string, repo: string, branch: string, token?: string}} config Target repository.
     * @param {typeof fetch} [fetchImpl] Fetch implementation (injectable for tests).
     */
    constructor(config, fetchImpl = globalThis.fetch.bind(globalThis)) {
        this.config = config;
        this.fetch = fetchImpl;
    }

    /** @returns {Record<string,string>} Request headers including auth when a token exists. */
    headers(accept = "application/vnd.github+json") {
        const headers = { Accept: accept };
        if (this.config.token) headers.Authorization = `Bearer ${this.config.token}`;
        return headers;
    }

    /**
     * Convert a failed response into a readable error.
     * @param {Response} response Failed response.
     * @returns {Promise<GitHubSyncError>} Error to throw.
     */
    async toError(response) {
        if (response.status === 404) {
            return new GitHubSyncError("Repository or branch not found. For a private repository, add a token with read access.", { status: 404 });
        }
        if (response.status === 401) {
            return new GitHubSyncError("GitHub rejected the token (401). Check that it is valid and not expired.", { status: 401 });
        }
        if (response.status === 403 || response.status === 429) {
            const reset = Number(response.headers?.get?.("x-ratelimit-reset")) * 1000;
            const when = reset ? ` Try again after ${new Date(reset).toLocaleTimeString()}, or add a token to raise the limit.` : "";
            return new GitHubSyncError(`GitHub rate limit or permission error (${response.status}).${when}`, { status: response.status });
        }
        return new GitHubSyncError(`GitHub returned HTTP ${response.status}.`, { status: response.status });
    }

    /**
     * List every file in the branch.
     * @returns {Promise<{path: string, sha: string, size: number}[]>} Blob entries.
     */
    async listFiles() {
        const { owner, repo, branch } = this.config;
        const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
        let response;
        try { response = await this.fetch(url, { headers: this.headers() }); }
        catch (cause) { throw new GitHubSyncError("Could not reach GitHub. Check your internet connection.", { cause }); }
        if (!response.ok) throw await this.toError(response);
        const tree = await response.json();
        if (tree.truncated) throw new GitHubSyncError("The repository tree is too large for one request (GitHub truncated it).");
        return (tree.tree || []).filter((node) => node.type === "blob").map((node) => ({ path: node.path, sha: node.sha, size: node.size || 0 }));
    }

    /**
     * Download one file as text. Uses the raw CDN first (no API rate limit),
     * then falls back to the blob API.
     * @param {{path: string, sha: string}} entry File to download.
     * @returns {Promise<string>} File contents (UTF-8).
     */
    async readFile(entry) {
        const { owner, repo, branch } = this.config;
        const encodedPath = entry.path.split("/").map(encodeURIComponent).join("/");
        const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodedPath}`;
        try {
            const raw = await this.fetch(rawUrl, { headers: this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {} });
            if (raw.ok) return await raw.text();
        } catch { /* Fall through to the API. */ }

        const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${entry.sha}`;
        const response = await this.fetch(apiUrl, { headers: this.headers("application/vnd.github.raw+json") });
        if (!response.ok) throw await this.toError(response);
        return response.text();
    }
}

/* ------------------------------------------------------------------ */
/* Hashing and JSON helpers                                            */
/* ------------------------------------------------------------------ */

/**
 * Compute the Git blob SHA-1 of text, identical to `git hash-object`.
 * Lets unchanged files be recognised without downloading them.
 * @param {string} text File contents.
 * @returns {Promise<string>} 40-character hex digest.
 */
export async function gitBlobSha(text) {
    const body = new TextEncoder().encode(text);
    const header = new TextEncoder().encode(`blob ${body.length}\0`);
    const bytes = new Uint8Array(header.length + body.length);
    bytes.set(header, 0);
    bytes.set(body, header.length);
    const digest = await crypto.subtle.digest("SHA-1", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Serialise a value with sorted object keys so equal data compares equal.
 * @param {unknown} value Any JSON value.
 * @returns {string} Canonical JSON.
 */
export function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

/**
 * Parse JSON, returning a sentinel on failure instead of throwing.
 * @param {string} text JSON text.
 * @returns {{ok: boolean, value?: unknown}} Parse outcome.
 */
function tryParseJson(text) {
    try { return { ok: true, value: JSON.parse(text) }; } catch { return { ok: false }; }
}

/**
 * Shorten a value for display in reports.
 * @param {unknown} value Any value.
 * @returns {string} Preview string.
 */
function preview(value) {
    const text = value === undefined ? "(absent)" : typeof value === "string" ? value : JSON.stringify(value);
    return text.length > MAX_VALUE_PREVIEW ? `${text.slice(0, MAX_VALUE_PREVIEW)}…` : text;
}

/** Small non-cryptographic hash used to key records that have no identifier. */
function shortHash(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

/**
 * Display key of a record: its strongest identity key (id, normalised URL,
 * normalised domain, word or title + date).
 * @param {unknown} record Array element.
 * @returns {string} Record key.
 */
export function recordKey(record) {
    return matchKeys(record)[0];
}

/* ------------------------------------------------------------------ */
/* Field-level diff                                                    */
/* ------------------------------------------------------------------ */

/**
 * Compute field-level differences between two values.
 * Objects are compared key by key; arrays and primitives are compared whole.
 * @param {unknown} remote Value on GitHub.
 * @param {unknown} local Value in the local database.
 * @param {string} [path] Dotted path of the value being compared.
 * @param {object[]} [out] Accumulator.
 * @returns {{path: string, type: string, github: string, local: string}[]} Differences.
 */
export function diffValues(remote, local, path = "", out = []) {
    if (out.length >= MAX_FIELD_DIFFS_PER_RECORD) return out;
    const bothObjects = remote && local && typeof remote === "object" && typeof local === "object"
        && !Array.isArray(remote) && !Array.isArray(local);
    if (bothObjects) {
        for (const key of [...new Set([...Object.keys(remote), ...Object.keys(local)])].sort()) {
            const next = path ? `${path}.${key}` : key;
            if (!(key in local)) out.push({ path: next, type: "missing-local", github: preview(remote[key]), local: "(absent)" });
            else if (!(key in remote)) out.push({ path: next, type: "extra-local", github: "(absent)", local: preview(local[key]) });
            else diffValues(remote[key], local[key], next, out);
        }
        return out;
    }
    if (stableStringify(remote) !== stableStringify(local)) {
        out.push({ path: path || "(value)", type: "changed", github: preview(remote), local: preview(local) });
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* File and record comparison                                          */
/* ------------------------------------------------------------------ */

/**
 * Compare the contents of one file present on both sides.
 * @param {string} remoteText GitHub contents.
 * @param {string} localText Local contents.
 * @returns {object} Record statistics and difference lists.
 */
function compareFileContents(remoteText, localText) {
    const remote = tryParseJson(remoteText);
    const local = tryParseJson(localText);

    // Non-JSON files (README, etc.) count as a single record.
    if (!remote.ok || !local.ok) {
        const same = remoteText === localText;
        return {
            kind: "text", remoteCount: 1, localCount: 1,
            matching: same ? 1 : 0, changed: same ? 0 : 1, missing: 0, extra: 0,
            changedRecords: same ? [] : [{ key: "(file)", fields: [{ path: "(content)", type: "changed", github: preview(remoteText), local: preview(localText) }] }],
            missingRecords: [], extraRecords: []
        };
    }

    // JSON array of records: pair records by identity (id, normalised URL/domain, title + date).
    if (Array.isArray(remote.value) && Array.isArray(local.value)) {
        const { pairs, missing, extra, remoteCount, localCount } = matchRecords(remote.value, local.value);
        const stats = {
            kind: "records", remoteCount, localCount,
            matching: 0, changed: 0, missing: missing.length, extra: extra.length,
            changedRecords: [],
            missingRecords: missing.map((record) => ({ key: recordKey(record), preview: preview(record) })),
            extraRecords: extra.map((record) => ({ key: recordKey(record), preview: preview(record) }))
        };
        for (const pair of pairs) {
            const fields = diffValues(pair.remote, pair.local);
            if (fields.length) { stats.changed += 1; stats.changedRecords.push({ key: recordKey(pair.remote), fields }); } else stats.matching += 1;
        }
        return stats;
    }

    // JSON object: one record, compared field by field.
    const fields = diffValues(remote.value, local.value);
    return {
        kind: "object", remoteCount: 1, localCount: 1,
        matching: fields.length ? 0 : 1, changed: fields.length ? 1 : 0, missing: 0, extra: 0,
        changedRecords: fields.length ? [{ key: "(object)", fields }] : [], missingRecords: [], extraRecords: []
    };
}

/**
 * Count the records in a JSON file's contents (used for one-sided files).
 * @param {string} text File contents.
 * @returns {number} Record count (1 for non-array content).
 */
function countRecords(text) {
    const parsed = tryParseJson(text);
    return parsed.ok && Array.isArray(parsed.value) ? parsed.value.length : 1;
}

/**
 * Compare the GitHub database directory with the local database.
 *
 * Files whose Git blob SHA matches are reported as identical without being
 * downloaded, so a typical comparison needs one API call plus only the files
 * that actually differ.
 * @param {object} options Comparison options.
 * @param {GitHubClient} options.client GitHub client.
 * @param {{path: string, data: string}[]} options.localEntries Local files (`database/...`).
 * @param {"library"|"all"} [options.scope] `library` limits to My Reading Library.
 * @param {(event: {phase: string, current: number, total: number, message: string}) => void} [options.onProgress] Progress callback.
 * @returns {Promise<object>} Comparison result with summary, files and remote texts.
 */
export async function compareDatabase({ client, localEntries, scope = "all", onProgress = () => {} }) {
    const prefix = scope === "library" ? LIBRARY_ROOT : DATABASE_ROOT;
    onProgress({ phase: "list", current: 0, total: 1, message: "Listing files on GitHub…" });
    const remoteFiles = (await client.listFiles()).filter((file) => file.path.startsWith(prefix));
    const localFiles = localEntries.filter((entry) => entry.path.startsWith(prefix));
    const remoteByPath = new Map(remoteFiles.map((file) => [file.path, file]));
    const localByPath = new Map(localFiles.map((file) => [file.path, file]));
    const paths = [...new Set([...remoteByPath.keys(), ...localByPath.keys()])].sort();

    const files = [];
    const remoteTexts = new Map();
    const remoteAll = new Map();   // every remote file's text (identical files reuse the local text)
    const localAll = new Map(localFiles.map((file) => [file.path, file.data]));
    for (let index = 0; index < paths.length; index += 1) {
        const path = paths[index];
        onProgress({ phase: "compare", current: index + 1, total: paths.length, message: `Comparing ${path.replace(DATABASE_ROOT, "")}` });
        const remote = remoteByPath.get(path);
        const local = localByPath.get(path);

        if (!remote) {
            const count = countRecords(local.data);
            files.push({ path, status: "extra-local", remoteCount: 0, localCount: count, matching: 0, changed: 0, missing: 0, extra: count, changedRecords: [], missingRecords: [], extraRecords: [] });
            continue;
        }
        if (!local) {
            const text = await client.readFile(remote);
            remoteTexts.set(path, text);
            remoteAll.set(path, text);
            const count = countRecords(text);
            files.push({ path, status: "missing-local", remoteCount: count, localCount: 0, matching: 0, changed: 0, missing: count, extra: 0, changedRecords: [], missingRecords: [], extraRecords: [] });
            continue;
        }
        if (await gitBlobSha(local.data) === remote.sha) {
            remoteAll.set(path, local.data);
            const count = countRecords(local.data);
            files.push({ path, status: "identical", remoteCount: count, localCount: count, matching: count, changed: 0, missing: 0, extra: 0, changedRecords: [], missingRecords: [], extraRecords: [] });
            continue;
        }
        const remoteText = await client.readFile(remote);
        remoteTexts.set(path, remoteText);
        remoteAll.set(path, remoteText);
        const stats = compareFileContents(remoteText, local.data);
        const differs = stats.changed || stats.missing || stats.extra;
        files.push({ path, status: differs ? "modified" : "formatting-only", ...stats });
    }
    const result = buildResult(files, remoteTexts, client.config, scope);
    result.collections = buildCollectionTable(remoteAll, localAll);
    return result;
}

/**
 * Aggregate per-file statistics into a result with summary totals.
 * @param {object[]} files Per-file results.
 * @param {Map<string,string>} remoteTexts Downloaded remote contents.
 * @param {object} config Repository configuration used.
 * @param {string} scope Comparison scope.
 * @returns {object} Final comparison result.
 */
function buildResult(files, remoteTexts, config, scope) {
    const sum = (field) => files.reduce((total, file) => total + (file[field] || 0), 0);
    const countStatus = (status) => files.filter((file) => file.status === status).length;
    const totalRemote = sum("remoteCount");
    const matching = sum("matching");
    return {
        generatedAt: new Date().toISOString(),
        repository: `${config.owner}/${config.repo}`,
        branch: config.branch,
        scope,
        summary: {
            files: files.length,
            filesIdentical: countStatus("identical") + countStatus("formatting-only"),
            filesModified: countStatus("modified"),
            filesMissingLocally: countStatus("missing-local"),
            filesExtraLocally: countStatus("extra-local"),
            recordsGitHub: totalRemote,
            recordsLocal: sum("localCount"),
            recordsMatching: matching,
            recordsChanged: sum("changed"),
            recordsMissing: sum("missing"),
            recordsExtra: sum("extra"),
            matchPercent: totalRemote ? Math.round((matching / totalRemote) * 1000) / 10 : 100
        },
        files,
        remoteTexts
    };
}

/** Collections shown in the GitHub-vs-local table, with display names. */
const TABLE_ROWS = Object.freeze([
    ["websites", "Websites"], ["articles", "Articles"], ["profiles", "Profiles"], ["favorites", "Favorites"],
    ["bookmarks", "Bookmarks"], ["vocabulary", "Vocabulary"], ["notes", "Notes"], ["highlights", "Highlights"],
    ["collections", "Collections"], ["topics", "Topics"], ["readingHistory", "Reading history"], ["categories", "Categories"]
]);

/**
 * Collect the records of every collection from a set of database files.
 * Records that appear in several files (for example an article listed in both
 * Core/articles.json and Saved Articles/General.json) are counted once.
 * @param {Map<string, string>} files Path to file text.
 * @returns {Map<string, unknown[]>} Collection target to records.
 */
function collectRecords(files) {
    const byTarget = new Map();
    const push = (target, records) => {
        if (!byTarget.has(target)) byTarget.set(target, []);
        byTarget.get(target).push(...records);
    };
    for (const [path, text] of files) {
        const mapping = mapPathToCollection(path);
        if (!mapping || mapping.derived) continue;
        const parsed = tryParseJson(text);
        if (!parsed.ok) continue;
        if (mapping.target === "settings") { if (Array.isArray(parsed.value?.websites)) push("websites", parsed.value.websites.map((site) => (typeof site === "string" ? { domain: site } : site))); }
        else if (Array.isArray(parsed.value)) push(mapping.target, parsed.value);
    }
    return byTarget;
}

/**
 * Build the per-collection GitHub-vs-local table (websites, articles, ...).
 * @param {Map<string, string>} remoteFiles Remote file contents.
 * @param {Map<string, string>} localFiles Local file contents.
 * @returns {{target: string, label: string, github: number, local: number, matching: number, changed: number, missing: number, extra: number}[]} Rows plus a final totals row.
 */
export function buildCollectionTable(remoteFiles, localFiles) {
    const remote = collectRecords(remoteFiles);
    const local = collectRecords(localFiles);
    const rows = TABLE_ROWS.map(([target, label]) => {
        const { pairs, missing, extra, remoteCount, localCount } = matchRecords(remote.get(target) || [], local.get(target) || []);
        const changed = pairs.filter((pair) => diffValues(pair.remote, pair.local).length).length;
        return { target, label, github: remoteCount, local: localCount, matching: pairs.length - changed, changed, missing: missing.length, extra: extra.length };
    });
    const total = { target: "total", label: "Total", github: 0, local: 0, matching: 0, changed: 0, missing: 0, extra: 0 };
    for (const row of rows) for (const field of ["github", "local", "matching", "changed", "missing", "extra"]) total[field] += row[field];
    return [...rows, total];
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

/**
 * Build a JSON-serialisable report (without raw remote file contents).
 * @param {object} result Output of {@link compareDatabase}.
 * @returns {object} Report object.
 */
export function buildJsonReport(result) {
    const { remoteTexts, ...report } = result;
    return report;
}

/**
 * Quote a value for CSV output.
 * @param {unknown} value Cell value.
 * @returns {string} Escaped cell.
 */
function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Build a flat CSV report: one row per differing field, missing or extra record.
 * @param {object} result Output of {@link compareDatabase}.
 * @returns {string} CSV text.
 */
export function buildCsvReport(result) {
    const rows = [["file", "file_status", "record_key", "record_status", "field", "github_value", "local_value"]];
    for (const file of result.files) {
        if (file.status === "identical" || file.status === "formatting-only") continue;
        for (const record of file.missingRecords) rows.push([file.path, file.status, record.key, "missing-locally", "", record.preview, ""]);
        for (const record of file.extraRecords) rows.push([file.path, file.status, record.key, "extra-locally", "", "", record.preview]);
        for (const record of file.changedRecords) {
            for (const field of record.fields) rows.push([file.path, file.status, record.key, "changed", field.path, field.github, field.local]);
        }
        if (!file.missingRecords.length && !file.extraRecords.length && !file.changedRecords.length) {
            rows.push([file.path, file.status, "", file.status, "", "", ""]);
        }
    }
    return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * Escape text for HTML output in the standalone report.
 * @param {unknown} value Any value.
 * @returns {string} Escaped text.
 */
function htmlEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * Render the per-collection counts as an HTML table for the standalone report.
 * @param {object[]} [rows] Output of {@link buildCollectionTable}.
 * @returns {string} Table markup.
 */
function collectionTableHtml(rows = []) {
    const body = rows.filter((row) => row.target === "total" || row.github || row.local)
        .map((row) => `<tr><td>${htmlEscape(row.label)}</td><td>${row.github}</td><td>${row.local}</td><td>${row.matching}</td><td>${row.changed}</td><td>${row.missing}</td><td>${row.extra}</td></tr>`).join("");
    return `<table><tr><th>Type</th><th>GitHub</th><th>Local</th><th>Matching</th><th>Changed</th><th>Missing locally</th><th>Extra locally</th></tr>${body}</table>`;
}

/**
 * Build a standalone, printable HTML report.
 * @param {object} result Output of {@link compareDatabase}.
 * @returns {string} Complete HTML document.
 */
export function buildHtmlReport(result) {
    const s = result.summary;
    const stat = (label, value) => `<div class="s"><span>${htmlEscape(label)}</span><b>${htmlEscape(value)}</b></div>`;
    const fileBlocks = result.files.filter((f) => f.status !== "identical" && f.status !== "formatting-only").map((file) => `
<section><h3>${htmlEscape(file.path.replace(DATABASE_ROOT, ""))} <em>${htmlEscape(file.status)}</em></h3>
${file.missingRecords.length ? `<h4>Missing locally (${file.missing})</h4><ul>${file.missingRecords.map((r) => `<li><code>${htmlEscape(r.key)}</code></li>`).join("")}</ul>` : ""}
${file.extraRecords.length ? `<h4>Extra locally (${file.extra})</h4><ul>${file.extraRecords.map((r) => `<li><code>${htmlEscape(r.key)}</code></li>`).join("")}</ul>` : ""}
${file.changedRecords.length ? `<h4>Changed (${file.changed})</h4>${file.changedRecords.map((r) => `<p><code>${htmlEscape(r.key)}</code></p><table><tr><th>Field</th><th>GitHub</th><th>Local</th></tr>${r.fields.map((f) => `<tr><td>${htmlEscape(f.path)}</td><td>${htmlEscape(f.github)}</td><td>${htmlEscape(f.local)}</td></tr>`).join("")}</table>`).join("")}` : ""}
</section>`).join("");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Charlie MJ database comparison</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:960px;margin:24px auto;padding:0 16px;color:#1b2033}
.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.s{border:1px solid #d5d9e8;border-radius:8px;padding:10px}
.s span{display:block;font-size:12px;color:#5b6486}.s b{font-size:20px}table{border-collapse:collapse;width:100%;margin-bottom:12px}
td,th{border:1px solid #d5d9e8;padding:4px 8px;text-align:left;vertical-align:top;word-break:break-word}em{font-weight:400;color:#5b6486}</style></head><body>
<h1>Database comparison</h1><p>${htmlEscape(result.repository)} (${htmlEscape(result.branch)}) · scope: ${htmlEscape(result.scope)} · ${htmlEscape(result.generatedAt)}</p>
<div class="g">${stat("GitHub records", s.recordsGitHub)}${stat("Local records", s.recordsLocal)}${stat("Matching", s.recordsMatching)}${stat("Changed", s.recordsChanged)}${stat("Missing locally", s.recordsMissing)}${stat("Extra locally", s.recordsExtra)}${stat("Match %", `${s.matchPercent}%`)}</div>
<h2>Records by type</h2>${collectionTableHtml(result.collections)}<h2>Differences</h2>${fileBlocks || "<p>No differences found.</p>"}</body></html>`;
}

/* ------------------------------------------------------------------ */
/* Pull: planning                                                      */
/* ------------------------------------------------------------------ */

/**
 * Describe where each remote file's records live in the local data model.
 * `derived` files (tags, labels, indexes) are regenerated locally and skipped.
 * @param {string} path Repository path.
 * @returns {{target: string, derived?: boolean}|null} Target collection, or null to ignore.
 */
function mapPathToCollection(path) {
    const relative = path.replace(DATABASE_ROOT, "");
    const core = relative.match(/^Core\/([^/]+)\.json$/);
    if (core) return core[1] === "settings" ? { target: "settings" } : CORE_COLLECTIONS.includes(core[1]) ? { target: core[1] } : null;
    if (/^My Reading Library\/Saved Articles\//.test(relative)) return { target: "articles" };
    if (/^My Reading Library\/Websites\//.test(relative)) return { target: "websites" };
    if (/^My Reading Library\/Profile Pages\//.test(relative)) return { target: "profiles" };
    if (/^My Reading Library\/Favorites\//.test(relative)) return { target: "favorites" };
    if (/^My Reading Library\/(Tags|Labels|Newspapers)\//.test(relative) || relative === "My Reading Library/index.json" || relative === "README.md") {
        return { target: "derived", derived: true };
    }
    return null;
}

/**
 * Read the current local records for a collection target.
 * @param {object} data Local extension data.
 * @param {string} target Collection target from {@link mapPathToCollection}.
 * @returns {unknown[]} Local records.
 */
function localRecords(data, target) {
    if (target === "websites") return (data.settings?.websites || []).map((site) => (typeof site === "string" ? { domain: site } : site));
    if (target === "profiles") return data.readingLibrary?.profiles || [];
    if (target === "favorites") return (data.readingLibrary?.favorites || []).map((domain) => ({ domain }));
    return Array.isArray(data[target]) ? data[target] : [];
}

/** Fields that identify or date a record rather than describe its content. */
const NON_CONTENT_FIELDS = new Set(["id", "updatedAt", "modifiedAt", "updated", "lastModified"]);

/** Fields holding addresses; they only count as different when the normalised address differs. */
const ADDRESS_FIELDS = new Set(["url", "link", "domain"]);

/**
 * Differences that change what a record actually says. Ids, timestamps and
 * cosmetic address differences (www, trailing slash, tracking parameters) are
 * ignored, so the same article saved twice is recognised as a duplicate.
 * @param {unknown} remote GitHub record.
 * @param {unknown} local Local record.
 * @returns {{path: string, type: string, github: string, local: string}[]} Content differences.
 */
export function contentDifferences(remote, local) {
    return diffValues(remote, local).filter((difference) => {
        if (NON_CONTENT_FIELDS.has(difference.path)) return false;
        if (ADDRESS_FIELDS.has(difference.path)) return normalizeUrlKey(remote?.[difference.path]) !== normalizeUrlKey(local?.[difference.path]);
        return true;
    });
}

/**
 * Classify one pair of records that exist on both sides but differ.
 *
 * Rule: the newest `updatedAt` wins. When either side has no timestamp, or the
 * timestamps are equal, the outcome is uncertain, so it is reported as a
 * conflict and the local version is kept until the user decides.
 * @param {unknown} remote GitHub record.
 * @param {unknown} local Local record.
 * @returns {"update"|"keep-local"|"conflict"} Decision.
 */
export function classifyDifference(remote, local) {
    const remoteTime = timestampOf(remote);
    const localTime = timestampOf(local);
    if (remoteTime && localTime) {
        if (remoteTime > localTime) return "update";
        if (remoteTime < localTime) return "keep-local";
    }
    return "conflict";
}

/**
 * Build a pull plan from a comparison result. Nothing is modified here.
 *
 * Merge rules (a pull never replaces or deletes the local database):
 *  - local-only records are always kept;
 *  - records only on GitHub are added;
 *  - the same record (matched by id, normalised URL/domain, or title + date)
 *    that is identical is skipped; if it differs, the newest `updatedAt` wins
 *    and anything uncertain becomes a conflict that keeps the local copy;
 *  - the websites list is merged as a union by normalised domain, so a pull
 *    can never shrink it, even when settings.json also contains `websites`;
 *  - secret and device-specific settings are never changed.
 * @param {object} result Output of {@link compareDatabase}.
 * @param {object} data Current local extension data (must be freshly read).
 * @returns {{adds: object[], updates: object[], skipped: object[], conflicts: object[], settingsChanges: object[], files: string[], derived: string[]}} Plan.
 */
export function planPull(result, data) {
    const remoteByTarget = new Map();
    const settingsChanges = [];
    const derived = [];
    const files = [];
    const addRemote = (target, records) => {
        if (!remoteByTarget.has(target)) remoteByTarget.set(target, []);
        remoteByTarget.get(target).push(...records);
    };

    for (const [path, text] of result.remoteTexts) {
        const mapping = mapPathToCollection(path);
        if (!mapping || mapping.derived) { derived.push(path); continue; }
        const parsed = tryParseJson(text);
        if (!parsed.ok) { derived.push(path); continue; }
        files.push(path);

        if (mapping.target === "settings") {
            const remoteSettings = sanitizeSettingsForSync(parsed.value || {});
            // The website list is merged as records below, never as one settings value.
            if (Array.isArray(remoteSettings.websites)) addRemote("websites", remoteSettings.websites.map((site) => (typeof site === "string" ? { domain: site } : site)));
            delete remoteSettings.websites;
            const localSettings = sanitizeSettingsForSync(data.settings || {});
            for (const key of Object.keys(remoteSettings)) {
                if (!(key in localSettings)) settingsChanges.push({ id: `settings:${key}`, key, kind: "add", label: key, github: remoteSettings[key], local: undefined });
                else if (stableStringify(remoteSettings[key]) !== stableStringify(localSettings[key])) {
                    settingsChanges.push({ id: `settings:${key}`, key, kind: "conflict", label: key, github: remoteSettings[key], local: localSettings[key] });
                }
            }
            continue;
        }
        if (Array.isArray(parsed.value)) addRemote(mapping.target, parsed.value);
    }

    const adds = [];
    const updates = [];
    const skipped = [];
    const conflicts = [];
    for (const [target, remoteRecords] of remoteByTarget) {
        const { pairs, missing } = matchRecords(remoteRecords, localRecords(data, target));
        for (const record of missing) {
            const key = recordKey(record);
            adds.push({ id: `${target}:${key}`, collection: target, key, label: recordLabel(record), record });
        }
        for (const { remote, local } of pairs) {
            const key = recordKey(remote);
            const base = { id: `${target}:${key}`, collection: target, key, label: recordLabel(remote), github: remote, local };
            const fields = contentDifferences(remote, local);
            const duplicate = recordKey(remote) !== recordKey(local);
            if (!fields.length) { skipped.push({ ...base, reason: duplicate ? "duplicate" : "identical" }); continue; }
            const verdict = classifyDifference(remote, local);
            if (verdict === "update") updates.push({ ...base, fields, reason: "GitHub copy is newer" });
            else if (verdict === "keep-local") skipped.push({ ...base, reason: "local copy is newer" });
            else conflicts.push({ ...base, fields, reason: "no clear newer copy" });
        }
    }
    return { adds, updates, skipped, conflicts, settingsChanges, files, derived };
}

/* ------------------------------------------------------------------ */
/* Pull: applying                                                      */
/* ------------------------------------------------------------------ */

/**
 * Apply a pull plan to a deep copy of the local data. Never deletes records.
 * @param {object} data Current local data (not mutated).
 * @param {object} plan Output of {@link planPull}.
 * @param {Record<string, "github"|"local">} [decisions] Per-conflict choices; anything not listed keeps local.
 * @returns {{data: object, summary: object}} New data and a summary with counts and name lists
 *     (`added`, `updated`, `skipped`, `conflicts`, `settings`).
 */
export function applyPull(data, plan, decisions = {}) {
    const next = JSON.parse(JSON.stringify(data));
    next.settings = next.settings || {};
    next.readingLibrary = next.readingLibrary || {};
    const summary = {
        added: { count: 0, names: [] }, updated: { count: 0, names: [] },
        skipped: { count: plan.skipped.length, names: plan.skipped.map((item) => `${item.label} (${item.reason})`) },
        conflicts: { count: 0, names: [] }, settings: { count: 0, names: [] }
    };

    /** Locate (or create) the list that holds a collection. */
    const listFor = (collection) => {
        if (collection === "websites") return (next.settings.websites = next.settings.websites || []);
        if (collection === "profiles") return (next.readingLibrary.profiles = next.readingLibrary.profiles || []);
        if (collection === "favorites") return (next.readingLibrary.favorites = next.readingLibrary.favorites || []);
        return (next[collection] = Array.isArray(next[collection]) ? next[collection] : []);
    };

    /** Add a record, or merge GitHub fields over the matching local record. */
    const upsert = (collection, record, replace) => {
        const list = listFor(collection);
        if (collection === "favorites") { if (!list.some((domain) => siteKey(domain) === siteKey(record))) list.push(record.domain); return; }
        const normalised = list.map((item) => (typeof item === "string" ? { domain: item } : item));
        const position = findMatch(buildKeyIndex(normalised), record);
        if (position === -1) list.push(record);
        else if (replace) list[position] = { ...normalised[position], ...record };   // keeps local-only fields
    };

    for (const item of plan.adds) { upsert(item.collection, item.record, false); summary.added.count += 1; summary.added.names.push(item.label); }
    for (const item of plan.updates) { upsert(item.collection, item.github, true); summary.updated.count += 1; summary.updated.names.push(item.label); }
    for (const item of plan.conflicts) {
        if (decisions[item.id] === "github") { upsert(item.collection, item.github, true); summary.updated.count += 1; summary.updated.names.push(`${item.label} (chosen: GitHub)`); }
        else { summary.conflicts.count += 1; summary.conflicts.names.push(item.label); }
    }
    for (const change of plan.settingsChanges) {
        if (change.kind === "add" || decisions[change.id] === "github") { next.settings[change.key] = change.github; summary.settings.count += 1; summary.settings.names.push(change.key); }
        else { summary.conflicts.count += 1; summary.conflicts.names.push(`setting: ${change.key}`); }
    }
    return { data: next, summary };
}

/* ------------------------------------------------------------------ */
/* Pre-pull backups                                                    */
/* ------------------------------------------------------------------ */

/**
 * Save a snapshot of the local data before a pull so it can be restored.
 * Only the newest {@link MAX_BACKUPS} snapshots are kept.
 * @param {object} data Local data to snapshot (secrets removed).
 * @returns {Promise<{id: string, createdAt: string}>} Backup descriptor.
 */
export async function createPrePullBackup(data) {
    const snapshot = JSON.parse(JSON.stringify(data));
    snapshot.settings = sanitizeSettingsForSync(snapshot.settings);
    const entry = { id: `backup-${Date.now()}`, createdAt: new Date().toISOString(), data: snapshot };
    const stored = (await chrome.storage.local.get(BACKUP_STORAGE_KEY))[BACKUP_STORAGE_KEY] || [];
    await chrome.storage.local.set({ [BACKUP_STORAGE_KEY]: [entry, ...stored].slice(0, MAX_BACKUPS) });
    return { id: entry.id, createdAt: entry.createdAt };
}

/**
 * Return the newest pre-pull backup, or null when none exists.
 * @returns {Promise<{id: string, createdAt: string, data: object}|null>} Backup.
 */
export async function getLatestBackup() {
    const stored = (await chrome.storage.local.get(BACKUP_STORAGE_KEY))[BACKUP_STORAGE_KEY] || [];
    return stored[0] || null;
}
