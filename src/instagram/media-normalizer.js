import { createMediaItem } from "../model/capture-item.js";

function selectedCandidate(probe, classification, expectedType) {
  const candidate = probe.candidates.find(
    (item) => item.index === classification.selectedCandidateIndex,
  );

  if (
    !candidate ||
    candidate.mediaType !== expectedType ||
    !candidate.source
  ) {
    throw new TypeError(
      "The selected " + expectedType + " media candidate is unavailable.",
    );
  }

  return candidate;
}

function optionalDimension(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function validWebUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function normalizeNonCarouselMedia({ probe, classification }) {
  if (classification.contentType === "image") {
    const image = selectedCandidate(probe, classification, "image");

    return Object.freeze([
      createMediaItem({
        sequence: 1,
        type: "image",
        role: "primary",
        url: image.source,
        width: optionalDimension(image.intrinsicWidth),
        height: optionalDimension(image.intrinsicHeight),
      }),
    ]);
  }

  if (classification.contentType === "reel") {
    const video = selectedCandidate(probe, classification, "video");
    const media = [
      createMediaItem({
        sequence: 1,
        type: "video",
        role: "primary",
        url: video.source,
        width: optionalDimension(video.intrinsicWidth),
        height: optionalDimension(video.intrinsicHeight),
      }),
    ];

    if (validWebUrl(video.poster)) {
      media.push(createMediaItem({
        type: "image",
        role: "auxiliary",
        purpose: "cover",
        url: video.poster,
      }));
    }

    return Object.freeze(media);
  }

  throw new TypeError(
    "Non-carousel media cannot be normalized for content type: " +
      classification.contentType + ".",
  );
}
