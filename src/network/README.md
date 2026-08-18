# Network

This component defines the portable binary-download contract and its isolated
Tampermonkey `GM_xmlhttpRequest` adapter. Downloads enforce timeout and HTTP
handling, retry transient failures once, validate binary signatures against
the extracted media model, and derive extensions from verified MIME formats.

`download-capture-media.js` retrieves items sequentially to bound memory and
produces deterministic file plans for storage. Required primary failures abort;
optional auxiliary failures become warnings and are removed from the finalized
CaptureItem.
