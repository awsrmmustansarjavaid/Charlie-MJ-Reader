/**
 * @file "GitHub Data Sync" panel for the extension settings page.
 *
 * Provides: default repository, full GitHub-vs-local comparison with exportable
 * reports, and a guarded "Git Pull" that merges GitHub data into local storage.
 * Business logic lives in `../lib/github-sync.js`; this file only handles the UI.
 */
import {
    DEFAULT_GITHUB_BRANCH,
    DEFAULT_GITHUB_REPOSITORY_URL,
    GitHubClient,
    applyPull,
    buildCsvReport,
    buildHtmlReport,
    buildJsonReport,
    compareDatabase,
    createPrePullBackup,
    getLatestBackup,
    parseGithubRepository,
    planPull,
    resolveSyncConfig
} from "../lib/github-sync.js";

/** Maximum differing records rendered per file in the on-screen report (exports are unlimited). */
const MAX_RENDERED_RECORDS_PER_FILE = 100;

/** Human readable names for file statuses. */
const STATUS_LABELS = Object.freeze({
    identical: "Identical",
    "formatting-only": "Same data (formatting differs)",
    modified: "Modified",
    "missing-local": "Missing locally",
    "extra-local": "Only local"
});

/**
 * Mount the sync panel.
 * @param {object} options Mount options.
 * @param {HTMLElement} options.container Element that receives the panel.
 * @param {() => object} options.getData Returns the live extension data.
 * @param {(next: object) => Promise<void>} options.setData Replaces the data and persists it.
 * @param {() => Promise<void>} options.persist Persists the current data object.
 * @param {() => {path: string, data: string}[]} options.getLocalEntries Local database files (`database/...`).
 * @param {(name: string, blob: Blob) => void} options.download Triggers a file download.
 * @param {(message: string) => Promise<boolean>} options.confirm Shows a confirmation dialog.
 * @param {(value: unknown) => string} options.escapeHtml HTML escaper.
 * @param {(paths: Set<string>) => void} options.prepareDifferenceZip Builds the "changed files" ZIP.
 * @param {() => void} options.prepareFullZip Builds the full database ZIP.
 * @param {() => void} options.rerender Re-renders the settings page after data changes.
 */
export function mountGithubSyncPanel({ container, getData, setData, persist, getLocalEntries, download, confirm, escapeHtml, prepareDifferenceZip, prepareFullZip, rerender }) {
    const settings = getData().settings;
    const config = resolveSyncConfig(settings);
    /** Last comparison result, reused by exports and "Prepare difference". */
    let lastResult = null;

    container.innerHTML = `
<div class="setting"><div><strong>Repository URL</strong>
<small>Default: ${escapeHtml(DEFAULT_GITHUB_REPOSITORY_URL)}</small></div>
<input id="gh-url" type="url" value="${escapeHtml(settings.githubRepoUrl || config.url)}" spellcheck="false"></div>
<div class="setting"><div><strong>Branch</strong></div>
<input id="gh-branch" value="${escapeHtml(config.branch)}" spellcheck="false"></div>
<div class="setting"><div><strong>Token (optional)</strong>
<small>Needed only for private repositories or higher rate limits. Stored on this device and never uploaded or exported.</small></div>
<input id="gh-token" type="password" autocomplete="off" placeholder="${settings.githubToken ? "Token saved (leave blank to keep)" : "GitHub token"}"></div>
<div class="setting"><div><strong>Scope</strong>
<small>What to compare and pull.</small></div>
<select id="gh-scope"><option value="all">Entire database/ directory</option><option value="library">My Reading Library only</option></select></div>
<div class="setting"><div><strong>Actions</strong></div>
<div class="site-actions">
<button class="btn" id="gh-save">Save</button>
<button class="btn" id="gh-reset">Use default repository</button>
<button class="btn" id="gh-compare">Compare GitHub</button>
<button class="btn" id="gh-pull">⬇ Git Pull</button>
<button class="btn" id="gh-prepare">Prepare GitHub</button>
<button class="btn" id="gh-diff">Prepare Difference</button>
</div></div>
<div id="gh-progress" class="gh-progress" hidden>
<progress id="gh-progress-bar" max="100" value="0"></progress><span id="gh-progress-text" aria-live="polite"></span></div>
<div id="gh-result" class="help" aria-live="polite"></div>`;

    const $ = (selector) => container.querySelector(selector);
    const result = $("#gh-result");

    /** Read the form into a settings patch, validating the repository URL. */
    const readForm = () => {
        const parsed = parseGithubRepository($("#gh-url").value);
        if (!parsed) throw new Error("Enter a valid repository, for example https://github.com/owner/repo.");
        return {
            githubRepoUrl: `https://github.com/${parsed.owner}/${parsed.repo}`,
            githubUser: parsed.owner,
            githubRepo: parsed.repo,
            githubBranch: $("#gh-branch").value.trim() || DEFAULT_GITHUB_BRANCH,
            token: $("#gh-token").value.trim()
        };
    };

    /** Persist the form values (the token only when a new one is typed). */
    const saveForm = async () => {
        const { token, ...patch } = readForm();
        Object.assign(getData().settings, patch);
        if (token) getData().settings.githubToken = token;
        $("#gh-token").value = "";
        await persist();
        return resolveSyncConfig(getData().settings);
    };

    const setProgress = ({ current, total, message }) => {
        $("#gh-progress").hidden = false;
        $("#gh-progress-bar").value = total ? Math.round((current / total) * 100) : 0;
        $("#gh-progress-text").textContent = message;
    };
    const hideProgress = () => { $("#gh-progress").hidden = true; };

    /** Disable the action buttons while an operation runs. */
    const busy = (flag) => container.querySelectorAll(".site-actions button").forEach((button) => { button.disabled = flag; });

    /** Run a comparison with the current form values. */
    const runComparison = async () => {
        const cfg = await saveForm();
        const client = new GitHubClient(cfg);
        lastResult = await compareDatabase({ client, localEntries: getLocalEntries(), scope: $("#gh-scope").value, onProgress: setProgress });
        return lastResult;
    };

    /** Render the summary cards. */
    const renderSummary = (summary) => {
        const card = (label, value) => `<div class="gh-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
        return `<div class="gh-cards">${card("GitHub records", summary.recordsGitHub)}${card("Local records", summary.recordsLocal)}${card("Matching", summary.recordsMatching)}${card("Changed", summary.recordsChanged)}${card("Missing locally", summary.recordsMissing)}${card("Extra locally", summary.recordsExtra)}${card("Files compared", summary.files)}${card("Match", `${summary.matchPercent}%`)}</div>`;
    };

    /** Render one file's differences inside a <details> block. */
    const renderFile = (file) => {
        const rows = [];
        for (const record of file.missingRecords.slice(0, MAX_RENDERED_RECORDS_PER_FILE)) rows.push(`<tr><td>${escapeHtml(record.key)}</td><td>Missing locally</td><td colspan="2">${escapeHtml(record.preview)}</td></tr>`);
        for (const record of file.extraRecords.slice(0, MAX_RENDERED_RECORDS_PER_FILE)) rows.push(`<tr><td>${escapeHtml(record.key)}</td><td>Extra locally</td><td colspan="2">${escapeHtml(record.preview)}</td></tr>`);
        for (const record of file.changedRecords.slice(0, MAX_RENDERED_RECORDS_PER_FILE)) {
            for (const field of record.fields) rows.push(`<tr><td>${escapeHtml(record.key)}</td><td>${escapeHtml(field.path)}</td><td>${escapeHtml(field.github)}</td><td>${escapeHtml(field.local)}</td></tr>`);
        }
        const truncated = file.missing + file.extra + file.changed > MAX_RENDERED_RECORDS_PER_FILE * 3 ? `<p class="help">Showing the first ${MAX_RENDERED_RECORDS_PER_FILE} per category. Export the report for everything.</p>` : "";
        return `<details class="gh-file"><summary>${escapeHtml(file.path.replace("database/", ""))} — ${escapeHtml(STATUS_LABELS[file.status] || file.status)} <small>(${file.matching} match, ${file.changed} changed, ${file.missing} missing, ${file.extra} extra)</small></summary>
${rows.length ? `<div class="gh-scroll"><table><tr><th>Record</th><th>Field / status</th><th>GitHub</th><th>Local</th></tr>${rows.join("")}</table></div>` : "<p class=\"help\">File-level difference only.</p>"}${truncated}</details>`;
    };

    /** Render the full comparison report. */
    const renderComparison = (comparison) => {
        const differing = comparison.files.filter((file) => file.status !== "identical" && file.status !== "formatting-only");
        result.innerHTML = `<strong>${escapeHtml(comparison.repository)} (${escapeHtml(comparison.branch)}) — ${escapeHtml(comparison.scope === "library" ? "My Reading Library" : "entire database")}</strong>
${renderSummary(comparison.summary)}
<div class="site-actions">
<button class="btn" id="gh-export-json">Export JSON</button>
<button class="btn" id="gh-export-csv">Export CSV</button>
<button class="btn" id="gh-export-html">Export HTML</button></div>
${differing.length ? differing.map(renderFile).join("") : "<p>No differences. Local data matches GitHub.</p>"}`;
        const stamp = comparison.generatedAt.replace(/[:.]/g, "-");
        $("#gh-export-json").onclick = () => download(`charlie-mj-comparison-${stamp}.json`, new Blob([JSON.stringify(buildJsonReport(comparison), null, 2)], { type: "application/json" }));
        $("#gh-export-csv").onclick = () => download(`charlie-mj-comparison-${stamp}.csv`, new Blob([buildCsvReport(comparison)], { type: "text/csv" }));
        $("#gh-export-html").onclick = () => download(`charlie-mj-comparison-${stamp}.html`, new Blob([buildHtmlReport(comparison)], { type: "text/html" }));
    };

    /** Render the pull preview with per-conflict decisions. */
    const renderPullPreview = (comparison, plan) => {
        const conflictCount = plan.conflicts.length + plan.settingsChanges.filter((change) => change.kind === "conflict").length;
        const settingsAdds = plan.settingsChanges.filter((change) => change.kind === "add").length;
        if (!plan.adds.length && !conflictCount && !settingsAdds) {
            result.innerHTML = `<strong>Already up to date.</strong><p>Nothing on GitHub needs to be added to your local database. ${renderSummary(comparison.summary)}</p>`;
            return;
        }
        const conflictRows = [...plan.conflicts.map((item) => ({ id: item.id, name: `${item.collection} · ${item.key}`, fields: item.fields.map((f) => f.path).join(", ") })),
            ...plan.settingsChanges.filter((change) => change.kind === "conflict").map((item) => ({ id: item.id, name: `setting · ${item.key}`, fields: "value" }))];
        result.innerHTML = `<strong>Pull preview</strong>
<div class="gh-cards">
<div class="gh-card"><span>Files read</span><strong>${plan.files.length}</strong></div>
<div class="gh-card"><span>Records to add</span><strong>${plan.adds.length}</strong></div>
<div class="gh-card"><span>Settings to add</span><strong>${settingsAdds}</strong></div>
<div class="gh-card"><span>Conflicts</span><strong>${conflictCount}</strong></div></div>
<p class="help">Protection: local-only records are never deleted, a backup is saved before anything changes, and conflicts keep your local version unless you choose GitHub. Secrets and device settings are never touched.</p>
<fieldset class="gh-mode"><legend>Conflict handling</legend>
<label><input type="radio" name="gh-mode" value="safe" checked> Safe merge — add new records, keep my local version of conflicts</label>
<label><input type="radio" name="gh-mode" value="github"> Prefer GitHub — use the GitHub version for every conflict</label></fieldset>
${conflictCount ? `<div class="gh-scroll"><table><tr><th>Record</th><th>Differing fields</th><th>Use</th></tr>${conflictRows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.fields)}</td><td><select data-conflict="${escapeHtml(row.id)}"><option value="local">Keep local</option><option value="github">Use GitHub</option></select></td></tr>`).join("")}</table></div>` : ""}
<div class="site-actions"><button class="btn" id="gh-apply">Apply pull</button><button class="btn" id="gh-cancel">Cancel</button></div>`;

        const selects = [...result.querySelectorAll("select[data-conflict]")];
        result.querySelectorAll('input[name="gh-mode"]').forEach((radio) => {
            radio.onchange = () => selects.forEach((select) => { select.value = radio.value === "github" ? "github" : "local"; });
        });
        $("#gh-cancel").onclick = () => { result.textContent = "Pull cancelled. Nothing was changed."; };
        $("#gh-apply").onclick = async () => {
            const decisions = Object.fromEntries(selects.map((select) => [select.dataset.conflict, select.value]));
            const overwriting = Object.values(decisions).filter((value) => value === "github").length;
            const message = `Add ${plan.adds.length + settingsAdds} new item(s) and replace ${overwriting} local conflicting item(s) with the GitHub version? A backup of your current data is saved first.`;
            if (!(await confirm(message))) return;
            busy(true);
            try {
                await createPrePullBackup(getData());
                const { data: merged, summary } = applyPull(getData(), plan, decisions);
                await setData(merged);
                result.innerHTML = `<strong>Pull complete.</strong>
<div class="gh-cards"><div class="gh-card"><span>Added</span><strong>${summary.added}</strong></div><div class="gh-card"><span>Replaced with GitHub</span><strong>${summary.updated}</strong></div><div class="gh-card"><span>Kept local</span><strong>${summary.keptLocal}</strong></div><div class="gh-card"><span>Settings added/updated</span><strong>${summary.settingsUpdated}</strong></div></div>
<p>Changed files: ${plan.files.map((path) => escapeHtml(path.replace("database/", ""))).join(", ") || "none"}.</p>
<div class="site-actions"><button class="btn" id="gh-restore">Undo this pull (restore backup)</button></div>`;
                $("#gh-restore").onclick = restoreBackup;
            } catch (error) {
                result.textContent = `Pull failed before completing: ${error.message}`;
            } finally {
                busy(false);
            }
        };
    };

    /** Restore the newest pre-pull backup, keeping this device's secrets. */
    const restoreBackup = async () => {
        const backup = await getLatestBackup();
        if (!backup) { result.textContent = "No backup found."; return; }
        if (!(await confirm(`Restore the backup made ${new Date(backup.createdAt).toLocaleString()}? Changes since then will be replaced.`))) return;
        const restored = { ...backup.data, settings: { ...backup.data.settings } };
        for (const key of ["githubToken", "githubUser", "githubRepo", "githubRepoUrl", "githubBranch", "localDatabaseFolderName"]) {
            if (getData().settings[key] !== undefined) restored.settings[key] = getData().settings[key];
        }
        await setData(restored);
        result.textContent = "Backup restored.";
        rerender();
    };

    /** Wrap an async action with busy state and readable error output. */
    const guarded = (action) => async () => {
        busy(true);
        result.textContent = "";
        try { await action(); }
        catch (error) { result.textContent = error.message || String(error); }
        finally { hideProgress(); busy(false); }
    };

    $("#gh-save").onclick = guarded(async () => { await saveForm(); result.textContent = "Sync settings saved."; });
    $("#gh-reset").onclick = guarded(async () => {
        Object.assign(getData().settings, { githubRepoUrl: DEFAULT_GITHUB_REPOSITORY_URL, githubBranch: DEFAULT_GITHUB_BRANCH, githubUser: "awsrmmustansarjavaid", githubRepo: "Charlie-MJ-Reader" });
        await persist();
        $("#gh-url").value = DEFAULT_GITHUB_REPOSITORY_URL;
        $("#gh-branch").value = DEFAULT_GITHUB_BRANCH;
        result.textContent = "Default repository restored.";
    });
    $("#gh-compare").onclick = guarded(async () => { renderComparison(await runComparison()); });
    $("#gh-pull").onclick = guarded(async () => {
        const comparison = await runComparison();
        renderPullPreview(comparison, planPull(comparison, getData()));
    });
    $("#gh-prepare").onclick = () => prepareFullZip();
    $("#gh-diff").onclick = guarded(async () => {
        const comparison = lastResult || await runComparison();
        const changed = new Set(comparison.files.filter((file) => file.status === "extra-local" || file.status === "modified").map((file) => file.path));
        if (!changed.size) { result.textContent = "No modified or new local files found."; return; }
        prepareDifferenceZip(changed);
        result.textContent = `Prepared ${changed.size} changed file(s).`;
    });
}
