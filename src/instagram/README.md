# Instagram extraction

This component contains isolated route detection and will contain metadata,
image, carousel, and reel extractors. It emits normalized capture data and
must not write files or invoke storage providers.

`item-route.js` recognizes canonical post and reel permalink routes, extracts
the Post ID, and removes query strings and fragments from the canonical URL.
It deliberately does not infer single-image versus carousel content from the
URL; that classification belongs to page-content extraction.

`item-context.js` resolves the active item through a strict layered strategy:
one unambiguous active-dialog permalink, the browser location, canonical/Open
Graph metadata, then one unambiguous main-region permalink. Dialog-scoped
metadata also precedes background-page metadata. Conflicting links stop
resolution rather than risking capture of the wrong item.

`metadata.js` reads author and caption through isolated, layered strategies:
semantic article content first, JSON-LD second, and narrowly parsed Open Graph
metadata last. It reports the successful source for diagnostics. `title.js`
derives a separate editable title without rewriting the captured caption.

`media-probe.js` performs conservative, read-only inspection of the primary
article. It records image/video evidence and semantic carousel controls while
filtering small rendered assets such as avatars from classification. Selectors
are centralised in `selectors.js`. When semantic article containers are absent,
the probe first narrows carousel candidates through semantic control ancestry,
then falls back to the main region and document. Media must intersect the
viewport before it can influence classification. Anonymous source fingerprints
make duplicate candidates visible in diagnostics. Carousel traversal and final
URL selection remain separate work and must not assume the probe candidates are
complete.

Without semantic carousel controls, page-wide media count is never treated as
carousel evidence. A single-image post requires one image to be clearly
dominant by rendered area; otherwise classification stops as ambiguous. This
prevents recommendation grids from being mistaken for carousel slides.

`carousel-traversal.js` owns the bounded traversal state machine: it rewinds to
the first slide, collects ordered primary media, detects stalled transitions
and loops, enforces a maximum, and attempts to restore the user's original
position. `carousel-dom-driver.js` isolates live control clicks, lazy-load
waiting, clipped-visibility selection, and current media URL discovery.

`media-normalizer.js` converts selected single-image and reel candidates into
typed primary/auxiliary media. `capture-snapshot.js` combines context,
metadata, classification and media into the storage-independent CaptureItem;
missing reel covers and authors are explicit non-fatal warnings.

`video-source.js` keeps temporary `blob:` and `data:` playback URLs out of the
capture model. It resolves a downloadable HTTP(S) reel URL from the video
element, active-item Open Graph metadata, or Post-ID-matched structured data.
Page-level fallbacks must match the active canonical Post ID so stale SPA
metadata cannot substitute media from another item. If Instagram exposes only
a temporary playback URL, capture stops with a specific recovery message.

Carousel extraction is the first implementation priority.
