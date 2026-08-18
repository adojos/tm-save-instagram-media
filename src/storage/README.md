# Storage

This component will contain distinct Obsidian and download-only providers.
It also owns the two-marker Mode A transaction and recovery protocol.

Instagram page extraction is prohibited here.

`media-filenames.js` plans deterministic basenames only after the downloader
has validated the physical media format. Both storage modes consume the same
plan. Single images use the non-reel primary sequence form `<PostID>-01.ext`;
reels use `<PostID>.mp4` and optional covers use `<PostID>-cover.ext`.

`capture-state.js` owns strict creation, parsing and classification of Mode A
incomplete/complete markers plus Post-ID directory discovery. Malformed,
mismatched and ambiguous state never authorizes automatic overwrite.
