/**
 * Charlie MJ Reader — Supported Websites gate.
 *
 * The explicit Supported Websites list (settings.websites) is the ONLY rule that decides whether
 * the extension runs on a page. Anything else is "sleeping": nothing is initialised, injected,
 * observed or stored there.
 *
 * Classic script (no import/export) so the same file can be loaded by the content script,
 * the service worker (importScripts) and the popup (<script>).
 */
(() => {
    "use strict";
    if (globalThis.CMJSiteGate)
        return;
    /** Feature switches available for every supported website (all default to ON). */
    const FEATURE_DEFAULTS = Object.freeze({
        toolbar: true, // floating main toolbar
        selectionToolbar: true, // toolbar that appears beside selected text (highlighter / quotes / paragraphs)
        vocabulary: true, // vocabulary + translation
        media: true, // listen / text-to-speech
        focus: true, // focus mode + ad hiding
        productivity: true, // Pomodoro / 80-20
        nativeReading: true, // word-by-word reading on the page
        readingTracking: true, // reading position / scroll progress
        autoScroll: true, // scrolling while native reading runs
        articleDetection: true // extracting the article (Reader, Save, Listen)
    });
    const FREEDIUM_HOST = /(^|\.)freedium-mirror\.cfd$/i;
    const normalizeHost = (value) => {
        try {
            const raw = String(value || "").trim();
            if (!raw)
                return "";
            const host = /^https?:\/\//i.test(raw)
                ? new URL(raw).hostname
                : raw.replace(/^\/\//, "").split("/")[0].split(":")[0];
            return host.toLowerCase().replace(/^www\./, "");
        }
        catch {
            return "";
        }
    };
    /**
     * The Freedium mirror is the reading surface for Medium, so it takes on Medium's status.
     * Returns the URL the rules should be evaluated against.
     */
    const effectiveUrl = (value) => {
        let url;
        try {
            url = new URL(String(value || ""));
        }
        catch {
            return null;
        }
        if (!/^https?:$/.test(url.protocol))
            return null;
        if (!FREEDIUM_HOST.test(url.hostname))
            return url;
        const rest = (url.pathname + url.search).replace(/^\/+/, "");
        const fixed = /^https?:\/(?!\/)/i.test(rest) ? rest.replace(/^(https?:)\//i, "$1//") : rest;
        try {
            return new URL(fixed);
        }
        catch {
            return new URL("https://medium.com/");
        }
    };
    const asList = (value) => Array.isArray(value)
        ? value.map((v) => String(v).trim()).filter(Boolean)
        : String(value || "").split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
    // Path rule: "/account" matches /account and everything below it; a pattern containing * is a wildcard match.
    const pathMatches = (pattern, pathname) => {
        let p = String(pattern || "").trim();
        if (!p)
            return false;
        if (!p.startsWith("/") && !p.startsWith("*"))
            p = "/" + p;
        if (!p.includes("*")) {
            const base = p.endsWith("/") ? p.slice(0, -1) : p;
            return pathname === base || pathname === base + "/" || pathname.startsWith(base + "/");
        }
        const re = new RegExp("^" + p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
        return re.test(pathname);
    };
    const toProfile = (entry) => (typeof entry === "string" ? { domain: entry, enabled: true } : entry);
    /**
     * Evaluates a URL against settings.websites.
     * @returns {{profile: object|null, hostMatched: boolean}} profile is set only when the page may run.
     *          hostMatched is true when the host is listed but a path rule keeps the page asleep.
     */
    const evaluate = (settings, rawUrl) => {
        const url = effectiveUrl(rawUrl);
        if (!url)
            return { profile: null, hostMatched: false };
        const host = normalizeHost(url.hostname);
        const pathname = url.pathname || "/";
        const list = Array.isArray(settings?.websites) ? settings.websites : [];
        let hostMatched = false;
        for (const entry of list) {
            const site = toProfile(entry);
            if (!site || site.enabled === false || site.activation === false)
                continue;
            const domain = normalizeHost(site.domain);
            if (!domain)
                continue;
            const sameHost = host === domain || (site.includeSubdomains !== false && host.endsWith("." + domain));
            if (!sameHost)
                continue;
            hostMatched = true;
            const excluded = asList(site.excludedPaths);
            const included = asList(site.includedPaths);
            if (excluded.some((p) => pathMatches(p, pathname)))
                continue;
            if (included.length && !included.some((p) => pathMatches(p, pathname)))
                continue;
            return { profile: { ...FEATURE_DEFAULTS, ...site, domain }, hostMatched: true };
        }
        return { profile: null, hostMatched };
    };
    globalThis.CMJSiteGate = Object.freeze({
        FEATURE_DEFAULTS, normalizeHost, effectiveUrl, pathMatches, evaluate,
        findProfile: (settings, url) => evaluate(settings, url).profile,
        isSupported: (settings, url) => !!evaluate(settings, url).profile
    });
})();
