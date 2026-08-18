const EXTENSION_PATTERN = /^[a-z0-9]+$/u;

function assertPostId(postId) {
  if (typeof postId !== "string" || !/^[A-Za-z0-9_-]+$/u.test(postId)) {
    throw new TypeError("postId must be a canonical Instagram ID.");
  }
}

export function planMediaFilenames({ captureItem, downloads }) {
  if (!captureItem || !Array.isArray(captureItem.media)) {
    throw new TypeError("A CaptureItem is required.");
  }
  assertPostId(captureItem.postId);

  if (!Array.isArray(downloads) || downloads.length !== captureItem.media.length) {
    throw new TypeError("Downloads must correspond one-to-one with media items.");
  }

  const sequenceWidth = Math.max(2, String(captureItem.mediaCount).length);

  return Object.freeze(captureItem.media.map((media, index) => {
    const download = downloads[index];
    const extension = download?.extension;
    if (typeof extension !== "string" || !EXTENSION_PATTERN.test(extension)) {
      throw new TypeError("A validated download extension is required.");
    }

    let basename;
    if (captureItem.contentType === "reel" && media.role === "primary") {
      basename = captureItem.postId;
    } else if (media.role === "auxiliary" && media.purpose === "cover") {
      basename = captureItem.postId + "-cover";
    } else if (media.role === "primary") {
      basename = captureItem.postId + "-" +
        String(media.sequence).padStart(sequenceWidth, "0");
    } else {
      throw new TypeError("Unsupported auxiliary media purpose.");
    }

    return Object.freeze({
      media,
      download,
      filename: basename + "." + extension,
    });
  }));
}
