# Installation Guide

## Requirements
- Google Chrome or a Chromium-based browser with Manifest V3 support.
- The extracted project folder. No Node.js or compilation is required for this starter build.

## Load unpacked
1. Extract `Charlie-MJ-Reader.zip` to a permanent folder.
2. Visit `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the folder containing `manifest.json`.
6. Pin the extension from Chrome's Extensions menu.

## Update
Replace the project files with the updated release, then click **Reload** on the extension card.

## Troubleshooting
- If the extension icon is missing, verify that the `assets/icons/icon16.png`, `icon32.png`, `icon48.png` and `icon128.png` files exist.
- Browser-internal pages (`chrome://`, Chrome Web Store, some PDF viewers) cannot be scripted.
- Some sites use shadow DOM, canvas, unusual article layouts or strict policies; extraction may be partial.
- If the floating toolbar is absent, reload the article tab after enabling the extension.
