# Charlie MJ Smart Audio Reader

## User workflow

- Select **Read** on a saved article. The reading workspace and media toolbar open, and speech starts automatically.
- Use Play/Resume, Pause, Stop, previous sentence, and next sentence controls.
- The active sentence is emphasized and the current word receives a separate highlight when the browser speech engine supplies word-boundary events.
- When a voice does not expose word boundaries, the reader estimates word timing within the current sentence. This fallback is approximate and may drift from the actual voice.
- Progress is saved on the article record. The reader restores the saved percentage/word position when reopened.

## Controls

- Playback speed: 0.5x–2.5x.
- Voice: voices exposed by the operating system/browser.
- Highlight modes: word, sentence, or combined (default).
- Auto-scroll, focus mode, pause-at-sentence, sleep timer, bookmark position, add note at position, and repeat current word.
- Keyboard shortcuts while the article reader is active: Space play/pause, Left/Right previous/next sentence, B bookmark.
- Optional play-next-saved-article queue.

## Limitations

Speech synthesis voices and word-boundary events vary by browser, operating system, and voice. The estimated timing fallback is visual guidance, not phonetic synchronization. Browser speech synthesis does not expose a reliable universal word timestamp API. Translation, microphone-based shadow reading, AI summaries, and certificates are not implemented by this build. Auto-scroll and focus mode apply to the saved-article workspace, not arbitrary source-site DOM.

## Additional learning and tracking

- Click a word in the saved-article reader to request an English definition from the configured dictionary API and optionally save it to Vocabulary. This requires network access to the dictionary service.
- Reading Analytics summarizes completed articles, tracked audio time, estimated words progressed through, and reading sessions.
- On completion, the reader can generate a plain-text personal completion record. It is not an accredited certificate.
