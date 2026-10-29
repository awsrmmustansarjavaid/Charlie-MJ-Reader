# Compatibility Adapter Package Storage

Charlie MJ Reader stores imported adapter packages in Chrome extension storage under the logical namespace:

`extensions/adapters/<adapter-id>/`

This is a package namespace, not a writable OS directory inside the installed Chrome extension.

## Package format

A ZIP adapter must contain:

```text
adapter.json
README.md                 optional
src/
  ...                     optional adapter assets
```

`adapter.json` must contain:

```json
{
  "id": "example-adapter",
  "name": "Example Adapter",
  "version": "1.0.0",
  "platform": "medium",
  "capabilities": ["extract", "metadata"],
  "entry": "src/adapter.js"
}
```

## Validation

The importer validates:

- ZIP structure and central directory
- package-size and file-count limits
- path traversal (`..`, absolute paths, drive paths, backslashes)
- duplicate paths
- supported ZIP compression
- per-file and total expanded size
- prohibited executable extensions
- required `adapter.json`
- adapter ID format
- semantic version format
- declared entry-file existence and safe path

JavaScript is retained as package data and is **not executed automatically**.

## Install lifecycle

1. Select ZIP from **Settings → Medium Compatibility → Adapter Package Manager**.
2. The package is parsed and validated locally.
3. A review dialog shows ID, version, file count, capabilities and storage namespace.
4. The user confirms installation.
5. An existing adapter with the same ID can be replaced only after confirmation.
6. The package is stored as a complete record in `adapterPackages`.
7. Enable/Disable, Details, Export and Delete are available from the same page.

## Security model

Adapters are data-only packages in this release. A future executable adapter runtime should require an explicit, separately reviewed and signed execution model; imported package JavaScript must never be treated as trusted extension code merely because it came from a ZIP.
