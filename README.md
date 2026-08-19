# Instagram Media Capture for Tampermonkey

[![License: MIT](https://img.shields.io/github/license/adojos/tampermonkey-insta-media-capture)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/adojos/tampermonkey-insta-media-capture)](https://github.com/adojos/tampermonkey-insta-media-capture/releases/latest)
[![Repository size](https://img.shields.io/github/repo-size/adojos/tampermonkey-insta-media-capture)](https://github.com/adojos/tampermonkey-insta-media-capture)
[![Primary language](https://img.shields.io/github/languages/top/adojos/tampermonkey-insta-media-capture)](src)
[![Tampermonkey userscript](https://img.shields.io/badge/Tampermonkey-userscript-00485B?logo=tampermonkey&logoColor=white)](https://raw.githubusercontent.com/adojos/tampermonkey-insta-media-capture/main/release/insta-media-capture.user.js)

A Tampermonkey userscript for saving Instagram images, mixed-media carousels, reels, captions, and source metadata.
<br>
<br>
## Install

1. Install Tampermonkey in Microsoft Edge, Chrome, or another Chromium-based browser.
2. Enable the browser extension setting **Allow User Scripts** when the browser requires it.
3. Open the [installable userscript](https://raw.githubusercontent.com/adojos/tampermonkey-insta-media-capture/main/release/insta-media-capture.user.js).
4. Review the Tampermonkey installation screen and select **Install**.

Tampermonkey can check the same release URL for later updates.

## Use

Open an individual Instagram post or reel while signed in. Select the floating **Save Instagram item** button, or use **Instagram Media Capture for Tampermonkey: Save current item** from the Tampermonkey menu.

The capture dialog supports two modes:

| Mode | Output |
| --- | --- |
| Save to Obsidian | Local media, structured Markdown, YAML metadata, and vault-relative embeds |
| Download only | A dedicated per-item directory containing media only |

On the first Obsidian capture, select the root of the vault—not a note folder.
The utility reuses a first-level `Media` directory when present. Otherwise it
offers to create `Media` at the vault root or beneath another folder selected
through the vault browser. The Markdown-note destination is selected
separately and may be anywhere inside the vault.

## Supported captures

- Single-image posts
- Mixed image/video carousels in their original sequence
- Reels, with an optional cover when Instagram exposes one reliably
- Original captions and source metadata without AI rewriting
- Download-only captures with non-destructive numbered directories
- Obsidian duplicate detection by canonical Instagram Post ID
- Explicit, deterministic recovery of interrupted Obsidian captures

## Storage model

The conventional Obsidian media hierarchy is:

    Media/
    └── Instagram/
        └── <Sanitised Title> - <PostID>/
            ├── <PostID>-01.jpg
            ├── <PostID>-02.mp4
            └── .capture-complete.json

The `Media` folder may instead live beneath another explicitly selected vault
folder. Its resolved vault-relative `Instagram` path is remembered in
IndexedDB. The Markdown note may live independently in any folder selected
through the vault browser. Download-only mode creates
`<Sanitised Title> - <PostID>` beneath a parent directory chosen with the
native directory picker; later collisions receive ` - 2`, ` - 3`, and so on.

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
- Media discovery checks only the vault root's immediate children; deeper locations require explicit selection through the vault browser.
- Instagram media is held in memory while a capture is being assembled, so very large videos may temporarily use substantial browser memory.

## Upgrading from v1.0

The first v1.1 Obsidian capture confirms the cached vault root and resolves the
Media location under the new rules. Existing folders created under an
incorrectly selected note subfolder are left untouched; the utility never
deletes or moves them automatically.

## Upgrading from v1.1 or v1.2

Versions 1.2 and 1.2.1 rename the project and shorten its technical artefact
names while retaining **Instagram Media Capture for Tampermonkey** as the
user-facing name. Because GitHub's former raw-content URL does not reliably
follow a renamed repository or file, this upgrade requires a one-time reinstall:

1. disable or remove **Instagram Capture Utility** in Tampermonkey,
2. install the new userscript from the link above, and
3. confirm that only the newly named script is enabled.

The existing browser-side configuration database keeps its historical name,
so reinstalling the userscript does not deliberately reset cached settings.

## Development

The repository uses modular ES source and bundles it into one installable userscript. End users install only the generated `.user.js` file; Node.js is required only for development.

    npm install
    npm run check

`npm run check` runs the complete Node test suite, builds `dist/insta-media-capture.user.js`, and copies the verified installable artifact to `release/insta-media-capture.user.js`.

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
