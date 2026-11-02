# Installation Guide

## Requirements
- Google Chrome or a Chromium-based browser with Manifest V3 support.
- The extracted project folder. No Node.js or compilation is required.

## Load unpacked
1. Extract `Charlie-MJ-Reader.zip` to a permanent folder.
2. Visit `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the folder that contains `manifest.json`.
5. Pin the extension from Chrome's Extensions menu.

## First run
1. Open **Settings → Supported Websites**. Charlie MJ Reader works only on the websites listed there; the list is pre-filled with a starter set including Medium.
2. Add the sites you read (domain only, for example `example.com`).
3. Open an article on one of those sites. The floating toolbar appears.

Any other website shows a grey **zzz** badge on the toolbar icon and is left completely untouched.

## Update
Replace the project files with the new release, then click **Reload** on the extension card. Supported tabs that are already open wake up automatically.

## Troubleshooting
- **No toolbar:** check the popup. If it says *Sleeping*, add the website under Settings → Supported Websites, or check that the page is not excluded by a path rule. Use **Test a page** on that settings page to see why.
- **"Reloaded or updated" message on a page:** refresh that tab once to reconnect.
- Browser-internal pages (`chrome://`, the Chrome Web Store, some PDF viewers) cannot be used.
- Sites with unusual layouts, shadow DOM or strict policies may give partial extraction.
- If the icon is missing, verify that `assets/icons/icon16.png`, `icon32.png`, `icon48.png` and `icon128.png` exist.
