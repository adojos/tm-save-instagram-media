const MIME_FORMATS = Object.freeze({
  "image/jpeg": Object.freeze({ mediaType: "image", extension: "jpg" }),
  "image/png": Object.freeze({ mediaType: "image", extension: "png" }),
  "image/webp": Object.freeze({ mediaType: "image", extension: "webp" }),
  "image/avif": Object.freeze({ mediaType: "image", extension: "avif" }),
  "video/mp4": Object.freeze({ mediaType: "video", extension: "mp4" }),
});

function normalizeMimeType(value) {
  return typeof value === "string"
    ? value.split(";", 1)[0].trim().toLowerCase()
    : "";
}

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function sniffMimeType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a
  ) {
    return "image/png";
  }

  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }

  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (["avif", "avis"].includes(brand)) {
      return "image/avif";
    }
    return "video/mp4";
  }

  return "";
}

export async function validateMediaBlob({ blob, expectedMediaType, declaredMimeType }) {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new TypeError("Downloaded media must be a non-empty Blob.");
  }

  const declared = normalizeMimeType(declaredMimeType || blob.type);
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const sniffed = sniffMimeType(bytes);
  const mimeType = sniffed;
  const format = MIME_FORMATS[mimeType];

  if (!format) {
    throw new TypeError(
      "Downloaded media has an unsupported or unverified content type.",
    );
  }

  if (format.mediaType !== expectedMediaType) {
    throw new TypeError(
      "Downloaded media type does not match the extracted media model.",
    );
  }

  if (MIME_FORMATS[declared] && declared !== sniffed) {
    throw new TypeError(
      "Downloaded media signature conflicts with its declared content type.",
    );
  }

  return Object.freeze({
    blob: blob.type === mimeType ? blob : blob.slice(0, blob.size, mimeType),
    mimeType,
    extension: format.extension,
  });
}
