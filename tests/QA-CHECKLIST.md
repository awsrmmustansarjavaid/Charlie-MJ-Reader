# Manual QA checklist

- [ ] Load unpacked project from folder containing `manifest.json`.
- [ ] Popup opens and shows current library counts.
- [ ] Save an accessible article from a normal HTTP/HTTPS tab.
- [ ] Duplicate URL does not create a second saved article from popup.
- [ ] Open full-page reader workspace.
- [ ] Search saved article title and body.
- [ ] Open saved article in reader view.
- [ ] Start and stop text-to-speech.
- [ ] Save selected text using floating toolbar.
- [ ] Save selected text using context menu.
- [ ] Add and delete a note.
- [ ] Add and delete vocabulary.
- [ ] Create and delete a collection.
- [ ] Export Markdown, TXT and JSON.
- [ ] Export and restore full backup.
- [ ] Change settings and reload extension; values persist.
- [ ] Add/remove a website domain in Website Manager.
- [ ] Confirm Medium Access Manager clearly says server-side limits cannot be reset.
- [ ] Confirm restricted browser pages fail gracefully.


## Vocabulary Studio integration checks
- [ ] On eksisozluk.com, selecting text displays the vocabulary toolbar.
- [ ] On an unconfigured domain, selecting text does not display the vocabulary toolbar.
- [ ] Add a custom hostname in Settings → Vocabulary, then reload that tab and verify toolbar activation.
- [ ] Translate selected text; original remains bold and translation is regular weight.
- [ ] Save selected text and verify it appears in Vocabulary in the Reader workspace with its source URL.
- [ ] Create a top-level category and a subcategory; assign a vocabulary entry.
- [ ] Edit and delete a category; verify saved vocabulary is retained.
- [ ] Search vocabulary by original, translation, definition and notes.
- [ ] Copy a vocabulary entry and export Markdown, CSV and JSON.
- [ ] Verify default manifest version remains 1.0.0.
