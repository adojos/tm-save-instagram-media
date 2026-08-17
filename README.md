# Instagram Capture Utility

A modular Tampermonkey userscript for capturing Instagram images, mixed-media carousels, reels, captions, and source metadata.

The utility is designed around two explicit workflows:

| Mode | Output |
| --- | --- |
| Save to Obsidian | Local media, structured Markdown, YAML metadata, and vault-local embeds |
| Download only | A dedicated per-item directory containing media only |

> [!IMPORTANT]
> This project is currently in the architecture-complete, pre-implementation stage. The authoritative design is documented and development of the userscript foundation is next.

## Design goals

- Preserve original Instagram captions without AI rewriting.
- Retrieve underlying media rather than screenshots where practical.
- Support images, mixed image/video carousels, and reels.
- Keep Obsidian storage separate from ordinary downloads.
- Use deterministic media names and explicit interrupted-capture recovery.
- Keep Instagram extraction, networking, filesystem access, storage, Markdown generation, and UI modular.
- Isolate Tampermonkey-specific APIs behind adapters.

## Storage model

Obsidian captures use a central vault-relative hierarchy:

    media/
    └── Instagram/
        └── <Sanitised Title> - <PostID>/
            ├── <PostID>-01.jpg
            ├── <PostID>-02.mp4
            └── .capture-complete.json

The Markdown note can live anywhere inside the configured vault. Download-only captures use a similarly named per-item directory in the parent folder selected by the user, without creating Markdown or Obsidian metadata.

## Architecture

    Instagram page
          |
          v
    Capture controller
          |
          v
    Instagram extractors
          |
          v
    Normalised capture model
          |
          +----------------------+
          |                      |
          v                      v
    Obsidian provider      Download-only provider
          |                      |
          v                      v
    Markdown + media       Media-only directory

## Project documentation

- [Engineering guidance](docs/Agents.md)
- [Requirements](docs/Requirements.md)
- [Architecture](docs/Architecture.md)
- [Architecture decisions](docs/Decisions.md)

These documents are authoritative. Architectural deviations must be documented before implementation.

## Planned development sequence

1. Establish the modular source tree, tests, and userscript build.
2. Validate Tampermonkey networking, filesystem access, and persisted directory handles.
3. Implement the normalized capture model and portable core services.
4. Implement carousel extraction first.
5. Add the custom modal and Instagram SPA lifecycle.
6. Complete Obsidian and download-only storage workflows.
7. Add single-image and reel extraction.
8. Harden recovery, error handling, and release packaging.

## Privacy and safety

- Filesystem access is limited to directories explicitly selected by the user.
- Obsidian vault handles are persisted through IndexedDB, not Instagram cookies.
- Captured content and vault paths are not transmitted to external services.
- Existing notes and unrelated files are never silently overwritten.

## License

Licensed under the [MIT License](LICENSE).
