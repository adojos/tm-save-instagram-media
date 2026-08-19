# Local Development

This document is the project-specific testing-environment record required by
the governance in `Agents.md`. Keep it current enough for another agent or
developer to reconstruct the useful development and validation environment
from a clean checkout, including material prerequisites, fixtures, manual
gates, limitations, and troubleshooting guidance.

## Prerequisites

- Node.js 20 or newer
- npm
- Tampermonkey for an optional live-browser acceptance test

## Install and validate

    npm install
    npm run check

The check command runs the portable Node test suite and bundles the ES module source into one userscript. It writes generated output to both:

    dist/instagram-media-capture.user.js
    release/instagram-media-capture.user.js

`dist/` is ignored working output. `release/` is the tracked, directly installable userscript published through GitHub.

For continuous local builds:

    npm run build:watch

Watch mode updates only `dist/instagram-media-capture.user.js`; run `npm run build` before committing a release artifact.

The legacy userscript `@namespace` is intentionally retained to avoid changing
the script's historical identity. The v1.2 repository rename requires a
one-time reinstall because GitHub's former raw-content URL does not reliably
follow the renamed repository. Future releases use the canonical file above.

## Runtime behavior

The userscript adds a floating capture button on supported Instagram post and reel contexts and follows Instagram SPA navigation. The Tampermonkey menu also provides:

- Save current item
- Change Obsidian vault
- Reset cached configuration
- Runtime and extraction diagnostics

The capture dialog obtains an editable title and selects either Obsidian or download-only mode. Obsidian destinations use the application-owned vault browser; ordinary downloads use the native parent-directory picker.

## Manual acceptance test

After `npm run check`, install `release/instagram-media-capture.user.js` in Tampermonkey and validate one example of each available Instagram content shape:

1. Single-image post
2. Carousel, including mixed media when available
3. Reel
4. Download-only capture
5. Obsidian capture, duplicate detection, and one deliberately interrupted recovery fixture when release risk warrants it

This live pass is intentionally consolidated because Instagram behavior cannot be reproduced completely by portable unit fixtures. Routine development should use the automated suite rather than repeated console-screenshot loops.
