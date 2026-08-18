import { createCaptureItem } from "../model/capture-item.js";
import { planMediaFilenames } from "../storage/media-filenames.js";

function rebuildCaptureItem(captureItem, media) {
  return createCaptureItem({
    source: captureItem.source,
    contentType: captureItem.contentType,
    postId: captureItem.postId,
    canonicalUrl: captureItem.canonicalUrl,
    author: captureItem.author,
    caption: captureItem.caption,
    proposedTitle: captureItem.proposedTitle,
    capturedAt: captureItem.capturedAt,
    media,
  });
}

export async function downloadCaptureMedia({
  captureItem,
  downloader,
  onProgress = () => {},
}) {
  if (!captureItem || !Array.isArray(captureItem.media)) {
    throw new TypeError("A CaptureItem is required.");
  }

  if (!downloader || typeof downloader.download !== "function") {
    throw new TypeError("A media downloader is required.");
  }

  if (typeof onProgress !== "function") {
    throw new TypeError("onProgress must be a function.");
  }

  const successfulMedia = [];
  const downloads = [];
  const warnings = [];

  for (let index = 0; index < captureItem.media.length; index += 1) {
    const media = captureItem.media[index];
    onProgress(Object.freeze({
      phase: "downloading",
      index: index + 1,
      total: captureItem.media.length,
      media,
    }));

    try {
      const download = await downloader.download(media);
      if (
        media.role === "auxiliary" &&
        media.purpose === "cover" &&
        download.extension !== "jpg"
      ) {
        warnings.push(
          "Optional reel cover was not supplied as a validated JPEG and was omitted.",
        );
        continue;
      }
      successfulMedia.push(media);
      downloads.push(download);
    } catch (error) {
      if (media.role === "auxiliary") {
        warnings.push(
          "Optional " + (media.purpose || media.type) +
            " media could not be downloaded.",
        );
        continue;
      }

      throw error;
    }
  }

  const finalizedCaptureItem = rebuildCaptureItem(
    captureItem,
    successfulMedia,
  );
  const files = planMediaFilenames({
    captureItem: finalizedCaptureItem,
    downloads,
  });

  onProgress(Object.freeze({
    phase: "complete",
    completed: files.length,
    total: captureItem.media.length,
  }));

  return Object.freeze({
    captureItem: finalizedCaptureItem,
    files,
    warnings: Object.freeze(warnings),
  });
}
