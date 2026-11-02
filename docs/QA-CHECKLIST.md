# Manual QA checklist

## Install and activation
- [ ] Load unpacked from the folder that contains `manifest.json`; manifest version is 1.0.0.
- [ ] Open Gmail, YouTube, a search engine: no toolbar, no selection toolbar, no page changes; toolbar icon shows **zzz**; popup says *Sleeping*.
- [ ] Open a supported website: toolbar appears; icon badge is clear; popup says *Active*.
- [ ] Settings → Supported Websites → **Test a page** reports Active for a listed address and Sleeping for others.
- [ ] Remove a site while its tab is open: toolbar, highlight classes, focus effects and styles disappear at once; selecting text does nothing.
- [ ] Add the site again: the open tab wakes without a refresh.
- [ ] Disable a site: it sleeps; Enable: it wakes.
- [ ] Add `/account` under *Never on these paths*: that path sleeps, other paths stay active.
- [ ] Turn off *Include subdomains*: a subdomain sleeps.
- [ ] Turn off each per-site feature in turn and confirm the matching feature disappears.
- [ ] A website that exists only in My Reading Library (not Supported) stays asleep.
- [ ] Reload the extension while a supported tab is open: no error appears on the page and the tab wakes again.

## Toolbar buttons
- [ ] Reader Workspace opens the article (button shows a busy state and ignores double clicks).
- [ ] Vocabulary, Productivity Reader, Focus, Productivity open their panels; pressing the same tool again closes it.
- [ ] With text selected, pressing Focus keeps the Focus panel open.
- [ ] Clicking the page closes open panels but keeps the toolbar; × hides it and selecting text brings it back.
- [ ] Translate, Meaning, ＋ Vocabulary, Quote, Paragraph, Selection, Copy, Notes work and confirm with a short message.
- [ ] Focus, Ads, Day, Night, Auto, sliders, Native Read / Stop Read work and the page scrolls smoothly.
- [ ] Pomodoro, 80/20 and Stop work.

## Capture and library
- [ ] Save an article from the popup; saving it again does not duplicate it.
- [ ] Open the full workspace; search saved articles by title and body; open one in the reader.
- [ ] Start and stop text-to-speech; progress is saved and restored.
- [ ] Save highlights, quotes, paragraphs, selections and bookmarks; check **See Saved**.
- [ ] Add and delete a note, a vocabulary entry and a collection.
- [ ] Export Markdown, TXT, HTML and JSON; export and restore a full backup.
- [ ] Change settings, reload the extension; values persist.

## Link menu
- [ ] Right-click a link: **Charlie MJ Reader** submenu shows *Open article in Reader Workspace* and *Save article to Saved Articles*.
- [ ] Open: the article appears in the Reader Workspace. Save: a notification confirms; the article is listed under Saved Articles once.
- [ ] A Medium link is captured completely.
- [ ] Right-click Save page / Save selection on a sleeping website shows the *sleeping* notice.

## Vocabulary
- [ ] Select text on a supported site; the selection toolbar appears; on an unsupported site it does not.
- [ ] Translate: original bold, translation regular.
- [ ] Save, then find it in Vocabulary with its source URL.
- [ ] Create a category and a subcategory; assign an entry; edit and delete a category (entries remain).
- [ ] Search by original, translation, definition, notes; copy; export Markdown, CSV, JSON.

## Medium
- [ ] A Medium story opens through Freedium and is captured in full.
- [ ] The Freedium page shows the toolbar when `medium.com` is supported.
- [ ] Restricted browser pages fail gracefully.
