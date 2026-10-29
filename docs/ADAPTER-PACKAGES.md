# Compatibility Adapter Packages

## Package layout

```text
adapter-id/
├── adapter.json
├── adapter.js
├── sources.json
├── README.md
└── assets/
```

`adapter.json` is required. It must contain a safe `id` and semantic `version`. If `entry` is provided, that file must exist.

## ZIP validation

- Rejects absolute paths and path traversal.
- Limits archive entries and per-file sizes.
- Accepts ZIP stored and deflate compression.
- Requires `adapter.json`.
- Validates adapter ID and version.
- Does not execute imported JavaScript. Adapter files are declarative metadata consumed by the built-in runtime.

## Installation

Settings → Compatibility Adapters → Import Adapter Package (.zip).

The package is stored in the logical namespace `extensions/adapters/<id>/` in extension storage. Enable/Disable controls do not delete the package.
