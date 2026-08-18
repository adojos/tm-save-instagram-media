# Instagram extraction

This component contains isolated route detection and will contain metadata,
image, carousel, and reel extractors. It emits normalized capture data and
must not write files or invoke storage providers.

`item-route.js` recognizes canonical post and reel permalink routes, extracts
the Post ID, and removes query strings and fragments from the canonical URL.
It deliberately does not infer single-image versus carousel content from the
URL; that classification belongs to page-content extraction.

`metadata.js` reads author and caption through isolated, layered strategies:
semantic article content first, JSON-LD second, and narrowly parsed Open Graph
metadata last. It reports the successful source for diagnostics. `title.js`
derives a separate editable title without rewriting the captured caption.

Carousel extraction is the first implementation priority.
