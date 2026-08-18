import { createCaptureItem } from "../model/capture-item.js";
import { createInstagramCarouselDriver } from "./carousel-dom-driver.js";
import { traverseCarousel } from "./carousel-traversal.js";
import { resolveInstagramItemContext } from "./item-context.js";
import { classifyMediaProbe, collectInstagramMediaProbe } from "./media-probe.js";
import { normalizeNonCarouselMedia } from "./media-normalizer.js";
import { extractInstagramMetadata } from "./metadata.js";

export class CaptureInspectionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "CaptureInspectionError";
    this.code = code;
  }
}

export function assembleCaptureSnapshot({
  itemRoute,
  metadata,
  classification,
  media,
  capturedAt,
}) {
  const warnings = [];
  const author = metadata.author || "unknown";

  if (!metadata.author) {
    warnings.push("Instagram author was unavailable; using 'unknown'.");
  }

  if (
    classification.contentType === "reel" &&
    !media.some((item) =>
      item.role === "auxiliary" && item.purpose === "cover")
  ) {
    warnings.push("A reliable reel cover was not available.");
  }

  const captureItem = createCaptureItem({
    contentType: classification.contentType,
    postId: itemRoute.postId,
    canonicalUrl: itemRoute.canonicalUrl,
    author,
    caption: metadata.caption,
    proposedTitle: metadata.proposedTitle,
    capturedAt,
    media,
  });

  return Object.freeze({
    captureItem,
    warnings: Object.freeze(warnings),
    diagnostics: Object.freeze({
      contextSource: itemRoute.resolutionSource ?? "unknown",
      classificationConfidence: classification.confidence,
      metadataSources: metadata.sources,
    }),
  });
}

export async function buildReadOnlyCaptureSnapshot({
  globalScope = globalThis,
  capturedAt = new Date().toISOString(),
  carouselDriverFactory = createInstagramCarouselDriver,
}) {
  const documentObject = globalScope?.document;
  const itemRoute = resolveInstagramItemContext({
    locationHref: globalScope?.location?.href,
    documentObject,
  });

  if (!itemRoute) {
    throw new CaptureInspectionError(
      "The active Instagram item could not be resolved unambiguously.",
      "UNSUPPORTED_CONTEXT",
    );
  }

  const metadata = extractInstagramMetadata({ documentObject, itemRoute });
  const probe = collectInstagramMediaProbe(documentObject, {
    width: globalScope?.innerWidth,
    height: globalScope?.innerHeight,
  }, itemRoute);
  const classification = classifyMediaProbe({ itemRoute, probe });

  if (classification.contentType === "unsupported") {
    const temporaryReel = itemRoute.routeKind === "reel" &&
      probe.candidates.some((candidate) =>
        candidate.mediaType === "video" && candidate.temporaryPlaybackDetected);
    throw new CaptureInspectionError(
      temporaryReel
        ? "Instagram exposed only a temporary reel playback URL. Reload the reel and try again."
        : "Instagram media could not be classified safely.",
      temporaryReel ? "REEL_DOWNLOAD_URL_UNAVAILABLE" : "UNSUPPORTED_MEDIA",
    );
  }

  let media;
  if (classification.contentType === "carousel") {
    const traversal = await traverseCarousel({
      driver: carouselDriverFactory({ documentObject, globalScope, itemRoute }),
    });
    media = traversal.media;
  } else {
    media = normalizeNonCarouselMedia({ probe, classification });
  }

  return assembleCaptureSnapshot({
    itemRoute,
    metadata,
    classification,
    media,
    capturedAt,
  });
}
