import {
  CAROUSEL_CONTROL_LABELS,
  INSTAGRAM_SELECTORS,
} from "./selectors.js";

const MIN_PRIMARY_INTRINSIC_EDGE = 320;
const MIN_PRIMARY_RENDERED_EDGE = 180;
const MAX_CONTROL_ANCESTORS = 10;

function finiteDimension(value) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function trimmedAttribute(element, name) {
  const value = element?.getAttribute?.(name);
  return typeof value === "string" ? value.trim() : "";
}

function elementDimensions(element, mediaType, viewport) {
  const rectangle = element?.getBoundingClientRect?.() ?? {};
  const renderedWidth = finiteDimension(rectangle.width);
  const renderedHeight = finiteDimension(rectangle.height);
  const hasViewport = Number.isFinite(viewport?.width) &&
    Number.isFinite(viewport?.height);
  const inViewport = renderedWidth > 0 && renderedHeight > 0 && (
    !hasViewport || (
      (rectangle.bottom ?? renderedHeight) > 0 &&
      (rectangle.right ?? renderedWidth) > 0 &&
      (rectangle.top ?? 0) < viewport.height &&
      (rectangle.left ?? 0) < viewport.width
    )
  );

  return {
    intrinsicWidth: finiteDimension(
      mediaType === "video" ? element?.videoWidth : element?.naturalWidth,
    ),
    intrinsicHeight: finiteDimension(
      mediaType === "video" ? element?.videoHeight : element?.naturalHeight,
    ),
    renderedWidth,
    renderedHeight,
    inViewport,
  };
}

function mediaSource(element, mediaType) {
  if (mediaType === "video") {
    return element?.currentSrc || element?.src ||
      element?.querySelector?.("source[src]")?.src || "";
  }

  return element?.currentSrc || element?.src || "";
}

export function fingerprintMediaSource(source) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isSubstantialMedia(dimensions) {
  const intrinsic = Math.max(
    dimensions.intrinsicWidth,
    dimensions.intrinsicHeight,
  );
  const renderedMinimum = Math.min(
    dimensions.renderedWidth,
    dimensions.renderedHeight,
  );

  return intrinsic >= MIN_PRIMARY_INTRINSIC_EDGE &&
    renderedMinimum >= MIN_PRIMARY_RENDERED_EDGE;
}

export function inspectInstagramMediaElement(element, index, viewport) {
  const mediaType = element?.tagName?.toLowerCase() === "video"
    ? "video"
    : "image";
  const dimensions = elementDimensions(element, mediaType, viewport);
  const source = mediaSource(element, mediaType);

  return Object.freeze({
    index: index + 1,
    mediaType,
    source,
    sourceFingerprint: source ? fingerprintMediaSource(source) : "",
    poster: mediaType === "video"
      ? trimmedAttribute(element, "poster")
      : "",
    alt: mediaType === "image"
      ? trimmedAttribute(element, "alt")
      : "",
    ...dimensions,
    visible:
      dimensions.renderedWidth > 0 && dimensions.renderedHeight > 0,
    substantial: Boolean(source) && dimensions.inViewport &&
      isSubstantialMedia(dimensions),
  });
}

function labelledCarouselControls(region) {
  return Array.from(
    region?.querySelectorAll?.(INSTAGRAM_SELECTORS.labelledButtons) ?? [],
  ).filter((button) => {
    const label = trimmedAttribute(button, "aria-label");
    return CAROUSEL_CONTROL_LABELS.next.test(label) ||
      CAROUSEL_CONTROL_LABELS.previous.test(label);
  });
}

function findCarouselControlRegion(documentObject) {
  const searchRoot = documentObject?.querySelector?.(
    INSTAGRAM_SELECTORS.mainRegion,
  ) ?? documentObject;
  const controls = labelledCarouselControls(searchRoot);

  for (const control of controls) {
    let ancestor = control.parentElement;

    for (let depth = 0; ancestor && depth < MAX_CONTROL_ANCESTORS; depth += 1) {
      if (
        ancestor.querySelectorAll?.(INSTAGRAM_SELECTORS.mediaElements)?.length > 0
      ) {
        return ancestor;
      }

      ancestor = ancestor.parentElement;
    }
  }

  return null;
}

export function locateInstagramMediaRegion(documentObject) {
  const carouselRegion = findCarouselControlRegion(documentObject);
  if (carouselRegion) {
    return { element: carouselRegion, kind: "carousel-control-ancestor" };
  }

  const primaryArticle = documentObject?.querySelector?.(
    INSTAGRAM_SELECTORS.primaryArticle,
  );
  if (primaryArticle) {
    return { element: primaryArticle, kind: "primary-article" };
  }

  const fallbackArticle = documentObject?.querySelector?.(
    INSTAGRAM_SELECTORS.fallbackArticle,
  );
  if (fallbackArticle) {
    return { element: fallbackArticle, kind: "fallback-article" };
  }

  const mainRegion = documentObject?.querySelector?.(
    INSTAGRAM_SELECTORS.mainRegion,
  );
  if (mainRegion) {
    return { element: mainRegion, kind: "main" };
  }

  if (documentObject?.querySelectorAll) {
    return { element: documentObject, kind: "document" };
  }

  return { element: null, kind: "none" };
}

export function collectInstagramMediaProbe(documentObject, viewport) {
  const region = locateInstagramMediaRegion(documentObject);

  if (!region.element) {
    return Object.freeze({
      articleFound: false,
      regionKind: "none",
      candidates: Object.freeze([]),
      carouselControlLabels: Object.freeze([]),
    });
  }

  const candidates = Array.from(
    region.element.querySelectorAll?.(INSTAGRAM_SELECTORS.mediaElements) ?? [],
    (element, index) => inspectInstagramMediaElement(element, index, viewport),
  );
  const carouselControlLabels = Array.from(
    labelledCarouselControls(region.element),
    (button) => trimmedAttribute(button, "aria-label"),
  );

  return Object.freeze({
    articleFound: region.kind.endsWith("article"),
    regionKind: region.kind,
    candidates: Object.freeze(candidates),
    carouselControlLabels: Object.freeze(carouselControlLabels),
  });
}

export function classifyMediaProbe({ itemRoute, probe }) {
  if (!itemRoute?.routeKind || !probe) {
    throw new TypeError("An item route and media probe are required.");
  }

  const substantialCandidates = probe.candidates.filter(
    (candidate) => candidate.substantial,
  );

  if (itemRoute.routeKind === "reel") {
    return Object.freeze({
      contentType: substantialCandidates.some(
        (candidate) => candidate.mediaType === "video",
      ) ? "reel" : "unsupported",
      confidence: "route-and-media",
      substantialCandidateCount: substantialCandidates.length,
    });
  }

  const hasCarouselControl = probe.carouselControlLabels.length > 0;

  if (hasCarouselControl || substantialCandidates.length > 1) {
    return Object.freeze({
      contentType: "carousel",
      confidence: hasCarouselControl ? "semantic-control" : "media-count",
      substantialCandidateCount: substantialCandidates.length,
    });
  }

  const onlyCandidate = substantialCandidates[0];
  const contentType = onlyCandidate?.mediaType === "image"
    ? "image"
    : "unsupported";

  return Object.freeze({
    contentType,
    confidence: onlyCandidate ? "single-media" : "insufficient-evidence",
    substantialCandidateCount: substantialCandidates.length,
  });
}
