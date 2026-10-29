# Feature Matrix & Roadmap

This matrix distinguishes implemented workflows from planned integrations. “Foundation” means the interface or local data model exists, but the full production feature is not complete.

| Feature | Status | Notes |
|---|---|---|
| MV3 extension popup | Implemented | Quick save, reader, listen, settings and backup |
| Active-page article capture | Implemented | Uses accessible DOM content; extraction can vary by site |
| Article metadata | Partial | Title, URL, domain, author and OG image when available |
| Local library | Implemented | Chrome local storage |
| Search | Basic | Searches saved article title and text |
| Floating toolbar | Basic | Save, reader, highlight, listen, dictionary action |
| Highlight storage | Implemented | Selected text and source URL |
| Multi-color highlights / annotations | Foundation | Color field stored; advanced selection editor planned |
| Notes | Basic | Independent text notes |
| Vocabulary Library | Implemented | Local-first entries with original text, translation, definition, examples, pronunciation, part of speech, tags, notes and source URL |
| Vocabulary categories | Implemented | Create top-level headings and nested subheadings; rename, re-parent and delete categories |
| Selection vocabulary toolbar | Implemented | Appears beside selected text only on enabled domains; default Ekşi Sözlük and X/Twitter; custom domains supported |
| Contextual translation | Implemented with external service | Turkish-to-English by default through public MyMemory endpoint; service limits/availability apply; language pair configurable |
| Vocabulary copy/export | Implemented | Copy original/translation, copy note format, export Markdown, CSV and JSON |
| Vocabulary revision | Basic | Review prompt with answer check and next-review scheduling; not a full adaptive SRS engine |
| Dictionary lookup | Partial | Translation popup and editable definition fields are available; dedicated Turkish morphology/dictionary provider is not included |
| Browser TTS | Basic | Speech Synthesis; word-level synchronized highlighting planned |
| Reading progress restore | Planned | Data model includes progress field |
| Themes | Partial | Settings model and UI; independent per-surface theme application planned |
| Website manager | Basic | Domain list settings; per-domain permission UX planned |
| Markdown/TXT/HTML/JSON export | Implemented | Article and full-library JSON backup |
| PDF/DOCX export | Planned | Add dedicated generators and formatting tests |
| AI assistant | Configuration foundation | No AI request is sent by this starter |
| AI summaries / Q&A / flashcards | Planned | Requires configured provider, explicit consent and privacy UX |
| Collections | Basic | Create collection records; item assignment UI planned |
| Reading analytics / Pomodoro | Planned | Local event model to be added |
| Cloud sync | Planned | Requires a secure backend and authentication |
| Medium Access Manager | Reminder/link foundation | Cannot reset server-side limits or reveal private account quota |
| Import / restore | Implemented | JSON backup restore |
| Knowledge graph / semantic search | Planned | Requires indexing and ranking implementation |

## Development milestones
1. Stabilize article extraction, content scripts and data schema.
2. Add robust selection anchoring, annotations and paragraph-level progress.
3. Add dictionary provider, vocabulary examples and spaced repetition.
4. Add real PDF/DOCX export with automated formatting tests.
5. Add AI provider adapters with consent, request preview and key protection.
6. Add Pomodoro, goals, analytics and reminders.
7. Add cloud sync only after security, encryption and conflict handling design.
