# 1.0.0 final fix (version unchanged)
- Fixed `src/reader/saved.js` stray `}` (Uncaught SyntaxError on See Saved).
- Main Toolbar: selecting text no longer opens the toolbar on non-allowed sites; Focus / ad-hide / native reading are also limited to allowed sites. `freedium-mirror.cfd` inherits `medium.com` status.
- Medium: structure-agnostic article-root detection (largest text container), live-vs-fetched pick by completeness on Freedium tabs, retry on 429/5xx, verification-page rejection.
- Medium: Reader / Save refresh an earlier incomplete saved copy when the new capture is longer. Library save-by-URL for medium.com goes via Freedium.
