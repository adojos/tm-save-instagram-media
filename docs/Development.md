# Local Development

## Prerequisites

- Node.js 20 or newer
- npm
- Tampermonkey

## Install

    npm install

## Validate

Run the portable unit tests:

    npm test

Build the installable userscript:

    npm run build

Run both:

    npm run check

The generated userscript is written to:

    dist/instagram-capture.user.js

The dist directory is intentionally excluded from Git. Release artifacts
will be generated from a verified source revision.

## Watch mode

    npm run build:watch

## Current runtime behavior

The scaffold registers a Tampermonkey menu command named:

    Instagram Capture Utility: Runtime diagnostics

Running it prints a capability report for:

- Tampermonkey cross-origin network requests
- the Tampermonkey menu API
- directory selection
- IndexedDB
- secure context
- top-level execution

No capture action is exposed yet. This is deliberate: extraction and
filesystem workflows will be enabled only after their implementation and
tests are complete.
