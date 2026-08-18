# Instagram Capture Utility

A Tampermonkey userscript for saving Instagram images, mixed-media carousels, reels, captions, and source metadata.

## Install

1. Install Tampermonkey in Microsoft Edge, Chrome, or another Chromium-based browser.
2. Enable the browser extension setting **Allow User Scripts** when the browser requires it.
3. Open the [installable userscript](https://raw.githubusercontent.com/adojos/tm-save-instagram-media/main/release/instagram-capture.user.js).
4. Review the Tampermonkey installation screen and select **Install**.

Tampermonkey can check the same release URL for later updates.

## Use

Open an individual Instagram post or reel while signed in. Select the floating **Save Instagram item** button, or use **Instagram Capture Utility: Save current item** from the Tampermonkey menu.

The capture dialog supports two modes:

| Mode | Output |
| --- | --- |
| Save to Obsidian | Local media, structured Markdown, YAML metadata, and vault-relative embeds |
| Download only | A dedicated per-item directory containing media only |

On the first Obsidian capture, select the root of the vault. The application-owned folder browser then presents note destinations only from inside that vault. The selected vault and most recent note folder are remembered locally.

## Supported captures

- Single-image posts
- Mixed image/video carousels in their original sequence
- Reels, with an optional cover when Instagram exposes one reliably
- Original captions and source metadata without AI rewriting
- Download-only captures with non-destructive numbered directories
- Obsidian duplicate detection by canonical Instagram Post ID
- Explicit, deterministic recovery of interrupted Obsidian captures

## Storage model

Obsidian captures use the fixed v1 vault-relative media root:

    media/
    └── Instagram/
        └── <Sanitised Title> - <PostID>/
            ├── <PostID>-01.jpg
            ├── <PostID>-02.mp4
            └── .capture-complete.json

The Markdown note may live in any folder selected through the vault browser. Download-only mode creates `<Sanitised Title> - <PostID>` beneath a parent directory chosen with the native directory picker; later collisions receive ` - 2`, ` - 3`, and so on.

## Recovery and safety

- Mode A writes `.capture-incomplete.json` before media and `.capture-complete.json` only after the Markdown note succeeds.
- A verified incomplete capture can overwrite only deterministic media files owned by the same Post ID, after confirmation.
- Completed Post IDs are blocked as duplicates within the configured vault.
- Existing unrelated or ambiguous files are never silently overwritten or deleted.
- Filesystem access is limited to directories explicitly selected by the user.
- Captured content and vault paths are not transmitted to this project or to an external service.

## Current limitations

- Instagram is an evolving single-page application; future DOM changes may require extractor updates.
- Captures require an authenticated Instagram session and an individual post or reel context.
- Local folder and Obsidian modes require the File System Access API available in current Chromium-based desktop browsers.
- The v1 media root is fixed at `media/Instagram/`; it is represented centrally so a later version can expose configuration.
- Instagram media is held in memory while a capture is being assembled, so very large videos may temporarily use substantial browser memory.

## Development

The repository uses modular ES source and bundles it into one installable userscript. End users install only the generated `.user.js` file; Node.js is required only for development.

    npm install
    npm run check

`npm run check` runs the complete Node test suite, builds `dist/instagram-capture.user.js`, and copies the verified installable artifact to `release/instagram-capture.user.js`.

## Project documentation

- [Engineering guidance](docs/Agents.md)
- [Requirements](docs/Requirements.md)
- [Architecture](docs/Architecture.md)
- [Architecture decisions](docs/Decisions.md)
- [Reference repositories](docs/Reference-Repositories.md)
- [Local development](docs/Development.md)

These documents are authoritative. Reference repositories provide inspiration only and do not override the project specification.

## License

Licensed under the [MIT License](LICENSE).
