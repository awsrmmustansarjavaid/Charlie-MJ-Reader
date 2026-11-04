# Installation Guide

## Requirements

- Google Chrome or a Chromium-based browser with Manifest V3 support.
- The extracted Charlie MJ Reader project folder.
- No Node.js, package manager, compilation or build command is required for the unpacked extension.

## Install as an unpacked extension

1. Download and extract the project ZIP.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the extracted project directory that contains `manifest.json`.
6. Pin Charlie MJ Reader from Chrome's Extensions menu.
7. Open the extension's Settings and review **Supported Websites**.

Do not select the `docs` folder or an inner `src` folder. Chrome must load the project root containing `manifest.json`.

## First-run setup

1. Open **Settings → Supported Websites**.
2. Review the bundled starter entries and add the domains you want to use.
3. Use the domain only (for example, `example.com`) unless a path rule is needed.
4. Open an article on an enabled site.
5. Use the floating toolbar, extension popup or right-click menu to capture and read content.

The extension's page tools run only on enabled Supported Websites. A site appearing in My Reading Library does not automatically activate page-level features.

## Updating

1. Keep a backup of important data using **Settings → Storage & Backup**.
2. Replace the old project files with the new release files, or extract the new release into a new folder.
3. Open `chrome://extensions`.
4. Click **Reload** on the Charlie MJ Reader extension card.
5. If a previously open page displays a reload/context message, refresh that page once.

## Troubleshooting

| Problem | What to check |
|---|---|
| No toolbar appears | Confirm the current domain is enabled in Supported Websites |
| Popup says Sleeping | Check the domain, subdomain option and path restrictions |
| A specific page is inactive | Use **Test a page** in Supported Websites |
| A site is in My Reading Library but has no toolbar | Add it separately to Supported Websites |
| Article extraction is incomplete | Try refresh/fetch; some sites expose limited or unusual article markup |
| Toolbar does not return after update | Reload the extension and refresh the affected tab |
| Extension cannot run on a browser page | `chrome://` pages, Chrome Web Store pages and some built-in PDF viewers restrict extensions |

## Browser compatibility notes

Speech voices and word-boundary events depend on the browser and operating system. Website extraction, SEO metadata and external data availability vary by source. The extension does not bypass login requirements, paywalls or site quotas.

For everyday workflows, continue with the [User Guide](USER-GUIDE.md). For the feature scope, see [FEATURES.md](FEATURES.md).
