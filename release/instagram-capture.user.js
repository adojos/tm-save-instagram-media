// ==UserScript==
// @name         Instagram Capture Utility
// @namespace    https://github.com/adojos/tm-save-instagram-media
// @version      1.0.0
// @description  Capture Instagram media and metadata to Obsidian or a local folder.
// @author       Tushar Sharma
// @homepageURL  https://github.com/adojos/tm-save-instagram-media
// @supportURL   https://github.com/adojos/tm-save-instagram-media/issues
// @downloadURL  https://raw.githubusercontent.com/adojos/tm-save-instagram-media/main/release/instagram-capture.user.js
// @updateURL    https://raw.githubusercontent.com/adojos/tm-save-instagram-media/main/release/instagram-capture.user.js
// @match        https://www.instagram.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      instagram.com
// @connect      cdninstagram.com
// @connect      fbcdn.net
// @run-at       document-idle
// @noframes
// ==/UserScript==
(() => {
  // src/config.js
  var APP_CONFIG = Object.freeze({
    name: "Instagram Capture Utility",
    version: "1.0.0",
    mediaRootSegments: Object.freeze(["media", "Instagram"]),
    settingsSchemaVersion: 1,
    captureStateSchemaVersion: 1
  });

  // src/runtime/capabilities.js
  function detectRuntimeCapabilities({
    globalScope = globalThis,
    gmRequest: gmRequest2,
    gmRegisterMenuCommand: gmRegisterMenuCommand2
  } = {}) {
    const capabilities = {
      tampermonkey: {
        networkRequest: typeof gmRequest2 === "function",
        menuCommand: typeof gmRegisterMenuCommand2 === "function"
      },
      filesystem: {
        directoryPicker: typeof globalScope?.showDirectoryPicker === "function"
      },
      persistence: {
        indexedDB: Boolean(globalScope?.indexedDB)
      },
      environment: {
        secureContext: globalScope?.isSecureContext === true,
        topLevel: !globalScope?.window || !globalScope?.window?.top || globalScope.window === globalScope.window.top
      }
    };
    return Object.freeze({
      ...capabilities,
      readyForFilesystemCapture: capabilities.filesystem.directoryPicker && capabilities.persistence.indexedDB && capabilities.environment.secureContext,
      readyForMediaDownload: capabilities.tampermonkey.networkRequest
    });
  }
  function flattenCapabilityReport(capabilities) {
    return {
      "Tampermonkey network API": capabilities.tampermonkey.networkRequest,
      "Tampermonkey menu API": capabilities.tampermonkey.menuCommand,
      "Directory picker": capabilities.filesystem.directoryPicker,
      IndexedDB: capabilities.persistence.indexedDB,
      "Secure context": capabilities.environment.secureContext,
      "Top-level page": capabilities.environment.topLevel,
      "Filesystem capture ready": capabilities.readyForFilesystemCapture,
      "Media download ready": capabilities.readyForMediaDownload
    };
  }

  // src/instagram/item-route.js
  var INSTAGRAM_HOSTS = /* @__PURE__ */ new Set([
    "instagram.com",
    "www.instagram.com"
  ]);
  var ROUTE_KINDS = Object.freeze({
    p: "post",
    reel: "reel"
  });
  var POST_ID_PATTERN = /^[A-Za-z0-9_-]+$/u;
  function detectInstagramItemRoute(urlLike) {
    let url;
    try {
      url = urlLike instanceof URL ? urlLike : new URL(urlLike);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || !INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) {
      return null;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 2) {
      return null;
    }
    const [route, postId] = segments;
    const routeKind = ROUTE_KINDS[route];
    if (!routeKind || !POST_ID_PATTERN.test(postId)) {
      return null;
    }
    return Object.freeze({
      routeKind,
      postId,
      canonicalUrl: "https://www.instagram.com/" + route + "/" + postId + "/"
    });
  }

  // src/instagram/item-context.js
  function attributeValue(element, name) {
    const value = element?.getAttribute?.(name);
    return typeof value === "string" ? value.trim() : "";
  }
  function routeFromValue(value) {
    try {
      return detectInstagramItemRoute(
        new URL(value, "https://www.instagram.com/")
      );
    } catch {
      return null;
    }
  }
  function uniqueRouteFromLinks(elements) {
    const routes = /* @__PURE__ */ new Map();
    for (const element of elements ?? []) {
      const route = routeFromValue(attributeValue(element, "href"));
      if (route) {
        routes.set(route.canonicalUrl, route);
      }
    }
    return routes.size === 1 ? [...routes.values()][0] : null;
  }
  function resolved(route, resolutionSource) {
    return route ? Object.freeze({ ...route, resolutionSource }) : null;
  }
  function resolveInstagramItemContext({
    locationHref,
    documentObject
  }) {
    const dialogRoute = uniqueRouteFromLinks(
      documentObject?.querySelectorAll?.(
        '[role="dialog"] a[href*="/p/"], [role="dialog"] a[href*="/reel/"]'
      )
    );
    if (dialogRoute) {
      return resolved(dialogRoute, "active-dialog");
    }
    const directRoute = detectInstagramItemRoute(locationHref);
    if (directRoute) {
      return resolved(directRoute, "location");
    }
    for (const [selector, attribute, source] of [
      ['link[rel="canonical"]', "href", "canonical-link"],
      ['meta[property="og:url"]', "content", "open-graph-url"]
    ]) {
      const element = documentObject?.querySelector?.(selector);
      const route = routeFromValue(attributeValue(element, attribute));
      if (route) {
        return resolved(route, source);
      }
    }
    const mainRoute = uniqueRouteFromLinks(
      documentObject?.querySelectorAll?.(
        'main a[href*="/p/"], main a[href*="/reel/"]'
      )
    );
    return resolved(mainRoute, "unambiguous-main-link");
  }

  // src/instagram/title.js
  var DEFAULT_MAX_TITLE_LENGTH = 100;
  function normalizeCandidate(value) {
    if (typeof value !== "string") {
      return "";
    }
    return value.replace(/\s+/gu, " ").trim();
  }
  function truncateAtWordBoundary(value, maxLength) {
    if (value.length <= maxLength) {
      return value;
    }
    const shortened = value.slice(0, maxLength + 1);
    const lastSpace = shortened.lastIndexOf(" ");
    const boundary = lastSpace >= Math.floor(maxLength * 0.6) ? lastSpace : maxLength;
    return shortened.slice(0, boundary).trimEnd();
  }
  function deriveProposedTitle({
    heading,
    caption,
    author,
    postId,
    maxLength = DEFAULT_MAX_TITLE_LENGTH
  }) {
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      throw new TypeError("maxLength must be a positive integer.");
    }
    if (typeof postId !== "string" || !/^[A-Za-z0-9_-]+$/u.test(postId)) {
      throw new TypeError("postId must be a canonical Instagram ID.");
    }
    const normalizedHeading = normalizeCandidate(heading);
    const firstCaptionLine = typeof caption === "string" ? normalizeCandidate(caption.split(/\r?\n/u).find((line) => line.trim())) : "";
    const fallbackAuthor = normalizeCandidate(author) || "Unknown author";
    const candidate = normalizedHeading || firstCaptionLine || "Instagram - " + fallbackAuthor + " - " + postId;
    return truncateAtWordBoundary(candidate, maxLength);
  }

  // src/instagram/metadata.js
  var USERNAME_PATTERN = /^[A-Za-z0-9._]+$/u;
  var RESERVED_PROFILE_ROUTES = /* @__PURE__ */ new Set([
    "accounts",
    "direct",
    "explore",
    "p",
    "reel",
    "reels",
    "stories"
  ]);
  function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
  }
  function textFrom(documentObject, selector) {
    return cleanText(documentObject?.querySelector?.(selector)?.textContent);
  }
  function attributeFrom(documentObject, selector, attribute) {
    return cleanText(
      documentObject?.querySelector?.(selector)?.getAttribute?.(attribute)
    );
  }
  function usernameFromProfileHref(href) {
    if (!href) {
      return "";
    }
    let url;
    try {
      url = new URL(href, "https://www.instagram.com/");
    } catch {
      return "";
    }
    if (![
      "instagram.com",
      "www.instagram.com"
    ].includes(url.hostname.toLowerCase())) {
      return "";
    }
    const segments = url.pathname.split("/").filter(Boolean);
    const username = segments.length === 1 ? segments[0] : "";
    if (!USERNAME_PATTERN.test(username) || RESERVED_PROFILE_ROUTES.has(username.toLowerCase())) {
      return "";
    }
    return username;
  }
  function findPostingNodes(value, results = []) {
    if (!value || typeof value !== "object") {
      return results;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        findPostingNodes(item, results);
      }
      return results;
    }
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (types.includes("SocialMediaPosting")) {
      results.push(value);
    }
    if (Array.isArray(value["@graph"])) {
      findPostingNodes(value["@graph"], results);
    }
    return results;
  }
  function readJsonLd(documentObject) {
    const scripts = documentObject?.querySelectorAll?.(
      'script[type="application/ld+json"]'
    ) ?? [];
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent);
        const posting = findPostingNodes(parsed)[0];
        if (!posting) {
          continue;
        }
        const authorObject = Array.isArray(posting.author) ? posting.author[0] : posting.author;
        const author = cleanText(
          authorObject?.alternateName ?? authorObject?.name
        ).replace(/^@/u, "");
        return {
          author,
          caption: cleanText(
            posting.articleBody ?? posting.caption ?? posting.description
          ),
          heading: cleanText(posting.headline)
        };
      } catch {
      }
    }
    return { author: "", caption: "", heading: "" };
  }
  function readOpenGraphFallback(documentObject) {
    const title = attributeFrom(
      documentObject,
      'meta[property="og:title"]',
      "content"
    );
    const description = attributeFrom(
      documentObject,
      'meta[property="og:description"]',
      "content"
    ) || attributeFrom(
      documentObject,
      'meta[name="description"]',
      "content"
    );
    const titleMatch = title.match(
      /^(.+?)\s+on Instagram:\s*[“"]([\s\S]*?)[”"]\s*$/u
    );
    const descriptionMatch = description.match(
      /-\s+([A-Za-z0-9._]+)\s+on\s+[^:]+:\s*[“"]([\s\S]*?)[”"]\.?$/u
    );
    return {
      author: cleanText(titleMatch?.[1] ?? descriptionMatch?.[1]),
      caption: cleanText(titleMatch?.[2] ?? descriptionMatch?.[2])
    };
  }
  function chooseValue(candidates) {
    return candidates.find(({ value }) => cleanText(value)) ?? {
      value: "",
      source: "unavailable"
    };
  }
  function extractInstagramMetadata({ documentObject, itemRoute }) {
    if (!itemRoute?.postId || !itemRoute?.canonicalUrl) {
      throw new TypeError("A detected Instagram item route is required.");
    }
    const dialogAuthor = usernameFromProfileHref(attributeFrom(
      documentObject,
      '[role="dialog"] header a[href]',
      "href"
    ));
    const articleAuthor = usernameFromProfileHref(
      attributeFrom(documentObject, "article header a[href]", "href")
    );
    const dialogCaption = textFrom(documentObject, '[role="dialog"] h1');
    const articleCaption = textFrom(documentObject, "article h1");
    const jsonLd = readJsonLd(documentObject);
    const openGraph = readOpenGraphFallback(documentObject);
    const author = chooseValue([
      { value: dialogAuthor, source: "dialog-profile-link" },
      { value: articleAuthor, source: "semantic-profile-link" },
      { value: jsonLd.author, source: "json-ld" },
      { value: openGraph.author, source: "open-graph" }
    ]);
    const caption = chooseValue([
      { value: dialogCaption, source: "dialog-heading" },
      { value: articleCaption, source: "semantic-heading" },
      { value: jsonLd.caption, source: "json-ld" },
      { value: openGraph.caption, source: "open-graph" }
    ]);
    const heading = chooseValue([
      { value: jsonLd.heading, source: "json-ld" }
    ]);
    return Object.freeze({
      postId: itemRoute.postId,
      canonicalUrl: itemRoute.canonicalUrl,
      author: cleanText(author.value),
      caption: cleanText(caption.value),
      proposedTitle: deriveProposedTitle({
        heading: heading.value,
        caption: caption.value,
        author: author.value,
        postId: itemRoute.postId
      }),
      sources: Object.freeze({
        author: author.source,
        caption: caption.source,
        heading: heading.source
      })
    });
  }

  // src/instagram/selectors.js
  var INSTAGRAM_SELECTORS = Object.freeze({
    primaryArticle: "main article",
    fallbackArticle: "article",
    mainRegion: "main",
    mediaElements: "video, img",
    labelledButtons: "button[aria-label]"
  });
  var CAROUSEL_CONTROL_LABELS = Object.freeze({
    next: /\bnext\b/iu,
    previous: /\b(previous|back)\b/iu
  });

  // src/instagram/media-probe.js
  var MIN_PRIMARY_INTRINSIC_EDGE = 320;
  var MIN_PRIMARY_RENDERED_EDGE = 180;
  var MAX_CONTROL_ANCESTORS = 10;
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
    const hasViewport = Number.isFinite(viewport?.width) && Number.isFinite(viewport?.height);
    const inViewport = renderedWidth > 0 && renderedHeight > 0 && (!hasViewport || (rectangle.bottom ?? renderedHeight) > 0 && (rectangle.right ?? renderedWidth) > 0 && (rectangle.top ?? 0) < viewport.height && (rectangle.left ?? 0) < viewport.width);
    return {
      intrinsicWidth: finiteDimension(
        mediaType === "video" ? element?.videoWidth : element?.naturalWidth
      ),
      intrinsicHeight: finiteDimension(
        mediaType === "video" ? element?.videoHeight : element?.naturalHeight
      ),
      renderedWidth,
      renderedHeight,
      inViewport
    };
  }
  function mediaSource(element, mediaType) {
    if (mediaType === "video") {
      return element?.currentSrc || element?.src || element?.querySelector?.("source[src]")?.src || "";
    }
    return element?.currentSrc || element?.src || "";
  }
  function fingerprintMediaSource(source) {
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function isSubstantialMedia(dimensions) {
    const intrinsic = Math.max(
      dimensions.intrinsicWidth,
      dimensions.intrinsicHeight
    );
    const renderedMinimum = Math.min(
      dimensions.renderedWidth,
      dimensions.renderedHeight
    );
    return intrinsic >= MIN_PRIMARY_INTRINSIC_EDGE && renderedMinimum >= MIN_PRIMARY_RENDERED_EDGE;
  }
  function inspectInstagramMediaElement(element, index, viewport) {
    const mediaType = element?.tagName?.toLowerCase() === "video" ? "video" : "image";
    const dimensions = elementDimensions(element, mediaType, viewport);
    const source = mediaSource(element, mediaType);
    return Object.freeze({
      index: index + 1,
      mediaType,
      source,
      sourceFingerprint: source ? fingerprintMediaSource(source) : "",
      poster: mediaType === "video" ? trimmedAttribute(element, "poster") : "",
      alt: mediaType === "image" ? trimmedAttribute(element, "alt") : "",
      ...dimensions,
      visible: dimensions.renderedWidth > 0 && dimensions.renderedHeight > 0,
      substantial: Boolean(source) && dimensions.inViewport && isSubstantialMedia(dimensions)
    });
  }
  function labelledCarouselControls(region) {
    return Array.from(
      region?.querySelectorAll?.(INSTAGRAM_SELECTORS.labelledButtons) ?? []
    ).filter((button) => {
      const label = trimmedAttribute(button, "aria-label");
      return CAROUSEL_CONTROL_LABELS.next.test(label) || CAROUSEL_CONTROL_LABELS.previous.test(label);
    });
  }
  function findCarouselControlRegion(documentObject) {
    const searchRoot = documentObject?.querySelector?.(
      INSTAGRAM_SELECTORS.mainRegion
    ) ?? documentObject;
    const controls = labelledCarouselControls(searchRoot);
    for (const control of controls) {
      let ancestor = control.parentElement;
      for (let depth = 0; ancestor && depth < MAX_CONTROL_ANCESTORS; depth += 1) {
        if (ancestor.querySelectorAll?.(INSTAGRAM_SELECTORS.mediaElements)?.length > 0) {
          return ancestor;
        }
        ancestor = ancestor.parentElement;
      }
    }
    return null;
  }
  function locateInstagramMediaRegion(documentObject) {
    const carouselRegion = findCarouselControlRegion(documentObject);
    if (carouselRegion) {
      return { element: carouselRegion, kind: "carousel-control-ancestor" };
    }
    const primaryArticle = documentObject?.querySelector?.(
      INSTAGRAM_SELECTORS.primaryArticle
    );
    if (primaryArticle) {
      return { element: primaryArticle, kind: "primary-article" };
    }
    const fallbackArticle = documentObject?.querySelector?.(
      INSTAGRAM_SELECTORS.fallbackArticle
    );
    if (fallbackArticle) {
      return { element: fallbackArticle, kind: "fallback-article" };
    }
    const mainRegion = documentObject?.querySelector?.(
      INSTAGRAM_SELECTORS.mainRegion
    );
    if (mainRegion) {
      return { element: mainRegion, kind: "main" };
    }
    if (documentObject?.querySelectorAll) {
      return { element: documentObject, kind: "document" };
    }
    return { element: null, kind: "none" };
  }
  function collectInstagramMediaProbe(documentObject, viewport) {
    const region = locateInstagramMediaRegion(documentObject);
    if (!region.element) {
      return Object.freeze({
        articleFound: false,
        regionKind: "none",
        candidates: Object.freeze([]),
        carouselControlLabels: Object.freeze([])
      });
    }
    const candidates = Array.from(
      region.element.querySelectorAll?.(INSTAGRAM_SELECTORS.mediaElements) ?? [],
      (element, index) => inspectInstagramMediaElement(element, index, viewport)
    );
    const carouselControlLabels = Array.from(
      labelledCarouselControls(region.element),
      (button) => trimmedAttribute(button, "aria-label")
    );
    return Object.freeze({
      articleFound: region.kind.endsWith("article"),
      regionKind: region.kind,
      candidates: Object.freeze(candidates),
      carouselControlLabels: Object.freeze(carouselControlLabels)
    });
  }
  function classifyMediaProbe({ itemRoute, probe }) {
    if (!itemRoute?.routeKind || !probe) {
      throw new TypeError("An item route and media probe are required.");
    }
    const substantialCandidates = probe.candidates.filter(
      (candidate) => candidate.substantial
    );
    if (itemRoute.routeKind === "reel") {
      const videoCandidates = substantialCandidates.filter((candidate) => candidate.mediaType === "video").sort(
        (left, right) => right.renderedWidth * right.renderedHeight - left.renderedWidth * left.renderedHeight
      );
      const selectedVideo = videoCandidates[0];
      const runnerUpVideo = videoCandidates[1];
      const selectedArea = selectedVideo ? selectedVideo.renderedWidth * selectedVideo.renderedHeight : 0;
      const runnerUpArea2 = runnerUpVideo ? runnerUpVideo.renderedWidth * runnerUpVideo.renderedHeight : 0;
      const isUnambiguous = Boolean(selectedVideo) && (!runnerUpVideo || selectedArea >= runnerUpArea2 * 1.25);
      return Object.freeze({
        contentType: isUnambiguous ? "reel" : "unsupported",
        confidence: isUnambiguous ? runnerUpVideo ? "route-and-dominant-video" : "route-and-video" : videoCandidates.length ? "ambiguous-videos" : "missing-video",
        substantialCandidateCount: substantialCandidates.length,
        selectedCandidateIndex: isUnambiguous ? selectedVideo.index : null,
        selectedSourceFingerprint: isUnambiguous ? selectedVideo.sourceFingerprint : null
      });
    }
    const hasCarouselControl = probe.carouselControlLabels.length > 0;
    if (hasCarouselControl) {
      return Object.freeze({
        contentType: "carousel",
        confidence: "semantic-control",
        substantialCandidateCount: substantialCandidates.length
      });
    }
    const rankedCandidates = [...substantialCandidates].sort(
      (left, right) => right.renderedWidth * right.renderedHeight - left.renderedWidth * left.renderedHeight
    );
    const dominantCandidate = rankedCandidates[0];
    const runnerUp = rankedCandidates[1];
    const dominantArea = dominantCandidate ? dominantCandidate.renderedWidth * dominantCandidate.renderedHeight : 0;
    const runnerUpArea = runnerUp ? runnerUp.renderedWidth * runnerUp.renderedHeight : 0;
    const isUnambiguousImage = dominantCandidate?.mediaType === "image" && (!runnerUp || dominantArea >= runnerUpArea * 1.25);
    return Object.freeze({
      contentType: isUnambiguousImage ? "image" : "unsupported",
      confidence: isUnambiguousImage ? runnerUp ? "dominant-media" : "single-media" : substantialCandidates.length ? "ambiguous-media" : "insufficient-evidence",
      substantialCandidateCount: substantialCandidates.length,
      selectedCandidateIndex: isUnambiguousImage ? dominantCandidate.index : null,
      selectedSourceFingerprint: isUnambiguousImage ? dominantCandidate.sourceFingerprint : null
    });
  }

  // src/instagram/carousel-dom-driver.js
  var MIN_MEDIA_EDGE = 180;
  var TRANSITION_TIMEOUT_MS = 5e3;
  var POLL_INTERVAL_MS = 100;
  function controlLabel(button) {
    return button?.getAttribute?.("aria-label")?.trim?.() ?? "";
  }
  function findControls(region) {
    const buttons = Array.from(
      region.querySelectorAll(INSTAGRAM_SELECTORS.labelledButtons)
    );
    return {
      next: buttons.find((button) => CAROUSEL_CONTROL_LABELS.next.test(controlLabel(button))),
      previous: buttons.find((button) => CAROUSEL_CONTROL_LABELS.previous.test(controlLabel(button)))
    };
  }
  function intersectRectangle(left, top, right, bottom, rectangle, clipX, clipY) {
    return {
      left: clipX ? Math.max(left, rectangle.left) : left,
      top: clipY ? Math.max(top, rectangle.top) : top,
      right: clipX ? Math.min(right, rectangle.right) : right,
      bottom: clipY ? Math.min(bottom, rectangle.bottom) : bottom
    };
  }
  function clippedVisibleArea(element, region, globalScope) {
    const rectangle = element.getBoundingClientRect();
    let bounds = {
      left: Math.max(0, rectangle.left),
      top: Math.max(0, rectangle.top),
      right: Math.min(globalScope.innerWidth, rectangle.right),
      bottom: Math.min(globalScope.innerHeight, rectangle.bottom)
    };
    let ancestor = element.parentElement;
    while (ancestor) {
      const style = globalScope.getComputedStyle?.(ancestor);
      const clipX = style && ["auto", "clip", "hidden", "scroll"].includes(
        style.overflowX
      );
      const clipY = style && ["auto", "clip", "hidden", "scroll"].includes(
        style.overflowY
      );
      if (clipX || clipY) {
        bounds = intersectRectangle(
          bounds.left,
          bounds.top,
          bounds.right,
          bounds.bottom,
          ancestor.getBoundingClientRect(),
          clipX,
          clipY
        );
      }
      if (ancestor === region) {
        break;
      }
      ancestor = ancestor.parentElement;
    }
    return Math.max(0, bounds.right - bounds.left) * Math.max(0, bounds.bottom - bounds.top);
  }
  function normalizedSourceIdentity(source) {
    try {
      const url = new URL(source);
      return url.origin + url.pathname;
    } catch {
      return source;
    }
  }
  function selectCurrentMedia(region, controls, globalScope) {
    const viewport = {
      width: globalScope.innerWidth,
      height: globalScope.innerHeight
    };
    const candidates = Array.from(
      region.querySelectorAll(INSTAGRAM_SELECTORS.mediaElements),
      (element, index) => ({
        element,
        summary: inspectInstagramMediaElement(element, index, viewport),
        area: clippedVisibleArea(element, region, globalScope)
      })
    ).filter(
      ({ summary }) => summary.source && Math.min(summary.renderedWidth, summary.renderedHeight) >= MIN_MEDIA_EDGE && Math.max(summary.intrinsicWidth, summary.intrinsicHeight) >= MIN_MEDIA_EDGE
    );
    if (candidates.length === 0) {
      return null;
    }
    candidates.sort((left, right) => right.area - left.area);
    const best = candidates[0];
    const runnerUp = candidates[1];
    if (runnerUp && best.area <= runnerUp.area * 1.05) {
      const domOrdered = [...candidates].sort(
        (left, right) => left.summary.index - right.summary.index
      );
      if (controls.next && !controls.previous) {
        return domOrdered[0];
      }
      if (controls.previous && !controls.next) {
        return domOrdered.at(-1);
      }
      if (controls.next && controls.previous && domOrdered.length % 2 === 1) {
        return domOrdered[Math.floor(domOrdered.length / 2)];
      }
      throw new Error(
        "Multiple carousel media candidates are equally visible; selection is ambiguous."
      );
    }
    return best;
  }
  function delay(globalScope, milliseconds) {
    return new Promise((resolve) => {
      globalScope.setTimeout(resolve, milliseconds);
    });
  }
  function createInstagramCarouselDriver({
    documentObject,
    globalScope = globalThis,
    transitionTimeoutMs = TRANSITION_TIMEOUT_MS,
    pollIntervalMs = POLL_INTERVAL_MS
  }) {
    function read() {
      const located = locateInstagramMediaRegion(documentObject);
      if (!located.element || located.kind !== "carousel-control-ancestor") {
        throw new Error("The active carousel region is unavailable.");
      }
      const controls = findControls(located.element);
      const selected = selectCurrentMedia(located.element, controls, globalScope);
      if (!selected) {
        throw new Error("No active carousel media could be identified.");
      }
      const { summary } = selected;
      const identity = fingerprintMediaSource(
        normalizedSourceIdentity(summary.source)
      );
      return Object.freeze({
        identity,
        media: Object.freeze({
          type: summary.mediaType,
          url: summary.source,
          width: summary.intrinsicWidth || void 0,
          height: summary.intrinsicHeight || void 0
        }),
        canPrevious: Boolean(controls.previous),
        canNext: Boolean(controls.next)
      });
    }
    async function move(direction, previousIdentity) {
      const located = locateInstagramMediaRegion(documentObject);
      if (!located.element) {
        throw new Error("The carousel region disappeared before navigation.");
      }
      const control = findControls(located.element)[direction];
      if (!control) {
        throw new Error("The carousel " + direction + " control is unavailable.");
      }
      control.click();
      const deadline = Date.now() + transitionTimeoutMs;
      while (Date.now() < deadline) {
        await delay(globalScope, pollIntervalMs);
        try {
          const state = read();
          if (state.identity !== previousIdentity) {
            return state;
          }
        } catch {
        }
      }
      throw new Error(
        "Instagram carousel did not expose a new slide before the timeout."
      );
    }
    return Object.freeze({
      read,
      previous(previousIdentity) {
        return move("previous", previousIdentity);
      },
      next(previousIdentity) {
        return move("next", previousIdentity);
      }
    });
  }

  // src/model/capture-item.js
  var CONTENT_TYPES = Object.freeze([
    "image",
    "carousel",
    "reel"
  ]);
  var MEDIA_TYPES = Object.freeze(["image", "video"]);
  var MEDIA_ROLES = Object.freeze(["primary", "auxiliary"]);
  function assertOneOf(value, allowed, label) {
    if (!allowed.includes(value)) {
      throw new TypeError(
        label + " must be one of: " + allowed.join(", ") + "."
      );
    }
  }
  function assertNonEmptyString(value, label) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError(label + " must be a non-empty string.");
    }
  }
  function assertWebUrl(value, label) {
    assertNonEmptyString(value, label);
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new TypeError(label + " must be a valid URL.");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new TypeError(label + " must use HTTP or HTTPS.");
    }
  }
  function createMediaItem({
    sequence,
    type,
    role = "primary",
    purpose,
    url,
    width,
    height
  }) {
    assertOneOf(type, MEDIA_TYPES, "media type");
    assertOneOf(role, MEDIA_ROLES, "media role");
    assertWebUrl(url, "media URL");
    if (role === "primary" && (!Number.isInteger(sequence) || sequence < 1)) {
      throw new TypeError(
        "Primary media requires a positive integer sequence."
      );
    }
    if (role === "auxiliary" && sequence !== void 0 && (!Number.isInteger(sequence) || sequence < 1)) {
      throw new TypeError(
        "Auxiliary media sequence must be a positive integer when set."
      );
    }
    for (const [label, value] of [
      ["width", width],
      ["height", height]
    ]) {
      if (value !== void 0 && (!Number.isInteger(value) || value < 1)) {
        throw new TypeError(
          "Media " + label + " must be a positive integer when set."
        );
      }
    }
    return Object.freeze({
      sequence,
      type,
      role,
      purpose: purpose ?? null,
      url,
      width: width ?? null,
      height: height ?? null
    });
  }
  function validatePrimaryMedia(contentType, primaryMedia) {
    if (primaryMedia.length < 1) {
      throw new TypeError(
        "A capture item requires at least one primary media item."
      );
    }
    const sequences = primaryMedia.map((item) => item.sequence);
    const expectedSequences = primaryMedia.map((_, index) => index + 1);
    if (sequences.some(
      (sequence, index) => sequence !== expectedSequences[index]
    )) {
      throw new TypeError(
        "Primary media sequence must start at 1 and remain contiguous."
      );
    }
    if (contentType === "image" && (primaryMedia.length !== 1 || primaryMedia[0].type !== "image")) {
      throw new TypeError(
        "Single-image captures require exactly one primary image."
      );
    }
    if (contentType === "reel" && (primaryMedia.length !== 1 || primaryMedia[0].type !== "video")) {
      throw new TypeError(
        "Reel captures require exactly one primary video."
      );
    }
  }
  function createCaptureItem({
    source = "instagram",
    contentType,
    postId,
    canonicalUrl,
    author,
    caption = "",
    proposedTitle,
    capturedAt,
    media
  }) {
    if (source !== "instagram") {
      throw new TypeError("source must be instagram.");
    }
    assertOneOf(contentType, CONTENT_TYPES, "content type");
    assertNonEmptyString(postId, "postId");
    if (!/^[A-Za-z0-9_-]+$/u.test(postId)) {
      throw new TypeError("postId must be a canonical Instagram ID.");
    }
    assertWebUrl(canonicalUrl, "canonicalUrl");
    assertNonEmptyString(author, "author");
    assertNonEmptyString(proposedTitle, "proposedTitle");
    assertNonEmptyString(capturedAt, "capturedAt");
    if (Number.isNaN(Date.parse(capturedAt))) {
      throw new TypeError("capturedAt must be an ISO-compatible timestamp.");
    }
    if (typeof caption !== "string") {
      throw new TypeError("caption must be a string.");
    }
    if (!Array.isArray(media)) {
      throw new TypeError("media must be an array.");
    }
    const normalizedMedia = media.map(
      (item) => Object.isFrozen(item) ? item : createMediaItem(item)
    );
    const primaryMedia = normalizedMedia.filter(
      (item) => item.role === "primary"
    );
    validatePrimaryMedia(contentType, primaryMedia);
    return Object.freeze({
      source,
      contentType,
      postId,
      canonicalUrl,
      author,
      caption,
      proposedTitle,
      capturedAt,
      media: Object.freeze(normalizedMedia),
      mediaCount: primaryMedia.length
    });
  }

  // src/instagram/carousel-traversal.js
  var CarouselTraversalError = class extends Error {
    constructor(message, code) {
      super(message);
      this.name = "CarouselTraversalError";
      this.code = code;
    }
  };
  function assertState(state) {
    if (!state || typeof state.identity !== "string" || state.identity === "" || !state.media) {
      throw new CarouselTraversalError(
        "The current carousel slide could not be identified safely.",
        "INVALID_STATE"
      );
    }
  }
  async function restoreOriginalPosition({ driver, state, originalIdentity, maxSlides }) {
    let current = state;
    for (let step = 0; step < maxSlides; step += 1) {
      if (current.identity === originalIdentity) {
        return true;
      }
      if (!current.canPrevious) {
        return false;
      }
      current = await driver.previous(current.identity);
      assertState(current);
    }
    return false;
  }
  async function traverseCarousel({
    driver,
    maxSlides = 50,
    restorePosition = true
  }) {
    if (!driver || typeof driver.read !== "function" || typeof driver.previous !== "function" || typeof driver.next !== "function") {
      throw new TypeError("A carousel driver is required.");
    }
    if (!Number.isInteger(maxSlides) || maxSlides < 1) {
      throw new TypeError("maxSlides must be a positive integer.");
    }
    let state = await driver.read();
    assertState(state);
    const originalIdentity = state.identity;
    const rewindSeen = /* @__PURE__ */ new Set();
    for (let step = 0; state.canPrevious; step += 1) {
      if (step >= maxSlides || rewindSeen.has(state.identity)) {
        throw new CarouselTraversalError(
          "Carousel rewind exceeded its safety limit or entered a loop.",
          "REWIND_LOOP"
        );
      }
      rewindSeen.add(state.identity);
      const previousIdentity = state.identity;
      state = await driver.previous(previousIdentity);
      assertState(state);
      if (state.identity === previousIdentity) {
        throw new CarouselTraversalError(
          "Carousel did not change after selecting Previous.",
          "PREVIOUS_STALLED"
        );
      }
    }
    const discovered = [];
    const forwardSeen = /* @__PURE__ */ new Set();
    for (let sequence = 1; sequence <= maxSlides; sequence += 1) {
      if (forwardSeen.has(state.identity)) {
        throw new CarouselTraversalError(
          "Carousel traversal encountered a previously visited slide.",
          "FORWARD_LOOP"
        );
      }
      forwardSeen.add(state.identity);
      discovered.push(createMediaItem({
        sequence,
        type: state.media.type,
        role: "primary",
        url: state.media.url,
        width: state.media.width,
        height: state.media.height
      }));
      if (!state.canNext) {
        break;
      }
      if (sequence === maxSlides) {
        throw new CarouselTraversalError(
          "Carousel exceeded the configured slide safety limit.",
          "MAX_SLIDES"
        );
      }
      const previousIdentity = state.identity;
      state = await driver.next(previousIdentity);
      assertState(state);
      if (state.identity === previousIdentity) {
        throw new CarouselTraversalError(
          "Carousel did not change after selecting Next.",
          "NEXT_STALLED"
        );
      }
    }
    const originalPositionRestored = restorePosition ? await restoreOriginalPosition({
      driver,
      state,
      originalIdentity,
      maxSlides
    }) : false;
    return Object.freeze({
      media: Object.freeze(discovered),
      originalPositionRestored
    });
  }

  // src/instagram/media-normalizer.js
  function selectedCandidate(probe, classification, expectedType) {
    const candidate = probe.candidates.find(
      (item) => item.index === classification.selectedCandidateIndex
    );
    if (!candidate || candidate.mediaType !== expectedType || !candidate.source) {
      throw new TypeError(
        "The selected " + expectedType + " media candidate is unavailable."
      );
    }
    return candidate;
  }
  function optionalDimension(value) {
    return Number.isInteger(value) && value > 0 ? value : void 0;
  }
  function validWebUrl(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol);
    } catch {
      return false;
    }
  }
  function normalizeNonCarouselMedia({ probe, classification }) {
    if (classification.contentType === "image") {
      const image = selectedCandidate(probe, classification, "image");
      return Object.freeze([
        createMediaItem({
          sequence: 1,
          type: "image",
          role: "primary",
          url: image.source,
          width: optionalDimension(image.intrinsicWidth),
          height: optionalDimension(image.intrinsicHeight)
        })
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
          height: optionalDimension(video.intrinsicHeight)
        })
      ];
      if (validWebUrl(video.poster)) {
        media.push(createMediaItem({
          type: "image",
          role: "auxiliary",
          purpose: "cover",
          url: video.poster
        }));
      }
      return Object.freeze(media);
    }
    throw new TypeError(
      "Non-carousel media cannot be normalized for content type: " + classification.contentType + "."
    );
  }

  // src/instagram/capture-snapshot.js
  var CaptureInspectionError = class extends Error {
    constructor(message, code) {
      super(message);
      this.name = "CaptureInspectionError";
      this.code = code;
    }
  };
  function assembleCaptureSnapshot({
    itemRoute,
    metadata,
    classification,
    media,
    capturedAt
  }) {
    const warnings = [];
    const author = metadata.author || "unknown";
    if (!metadata.author) {
      warnings.push("Instagram author was unavailable; using 'unknown'.");
    }
    if (classification.contentType === "reel" && !media.some((item) => item.role === "auxiliary" && item.purpose === "cover")) {
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
      media
    });
    return Object.freeze({
      captureItem,
      warnings: Object.freeze(warnings),
      diagnostics: Object.freeze({
        contextSource: itemRoute.resolutionSource ?? "unknown",
        classificationConfidence: classification.confidence,
        metadataSources: metadata.sources
      })
    });
  }
  async function buildReadOnlyCaptureSnapshot({
    globalScope = globalThis,
    capturedAt = (/* @__PURE__ */ new Date()).toISOString(),
    carouselDriverFactory = createInstagramCarouselDriver
  }) {
    const documentObject = globalScope?.document;
    const itemRoute = resolveInstagramItemContext({
      locationHref: globalScope?.location?.href,
      documentObject
    });
    if (!itemRoute) {
      throw new CaptureInspectionError(
        "The active Instagram item could not be resolved unambiguously.",
        "UNSUPPORTED_CONTEXT"
      );
    }
    const metadata = extractInstagramMetadata({ documentObject, itemRoute });
    const probe = collectInstagramMediaProbe(documentObject, {
      width: globalScope?.innerWidth,
      height: globalScope?.innerHeight
    });
    const classification = classifyMediaProbe({ itemRoute, probe });
    if (classification.contentType === "unsupported") {
      throw new CaptureInspectionError(
        "Instagram media could not be classified safely.",
        "UNSUPPORTED_MEDIA"
      );
    }
    let media;
    if (classification.contentType === "carousel") {
      const traversal = await traverseCarousel({
        driver: carouselDriverFactory({ documentObject, globalScope })
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
      capturedAt
    });
  }

  // src/app/controller.js
  var ApplicationController = class {
    #globalScope;
    #logger;
    #menu;
    #gmRequest;
    #workflow;
    #ui;
    #pageLifecycle;
    #vaultManager;
    #settingsManager;
    #initialised = false;
    constructor({
      globalScope = globalThis,
      logger,
      menu,
      gmRequest: gmRequest2,
      workflow,
      ui,
      pageLifecycle,
      vaultManager,
      settingsManager
    }) {
      this.#globalScope = globalScope;
      this.#logger = logger;
      this.#menu = menu;
      this.#gmRequest = gmRequest2;
      this.#workflow = workflow;
      this.#ui = ui;
      this.#pageLifecycle = pageLifecycle;
      this.#vaultManager = vaultManager;
      this.#settingsManager = settingsManager;
    }
    initialise() {
      if (this.#initialised) {
        return;
      }
      const capabilities = this.getCapabilities();
      this.#menu.register(
        APP_CONFIG.name + ": Runtime diagnostics",
        () => this.reportCapabilities()
      );
      this.#menu.register(
        APP_CONFIG.name + ": Inspect current item",
        () => this.inspectCurrentItem()
      );
      this.#menu.register(
        APP_CONFIG.name + ": Traverse carousel (diagnostic)",
        () => void this.traverseCurrentCarousel()
      );
      this.#menu.register(
        APP_CONFIG.name + ": Build capture snapshot (diagnostic)",
        () => void this.buildCurrentCaptureSnapshot()
      );
      this.#menu.register(
        APP_CONFIG.name + ": Save current item",
        () => void this.#workflow?.run()
      );
      this.#menu.register(
        APP_CONFIG.name + ": Change Obsidian vault",
        () => void this.changeVault()
      );
      this.#menu.register(
        APP_CONFIG.name + ": Reset cached configuration",
        () => void this.resetConfiguration()
      );
      this.#logger.info(
        APP_CONFIG.name + " " + APP_CONFIG.version + " initialised."
      );
      if (!capabilities.readyForFilesystemCapture) {
        this.#logger.warn(
          "Filesystem capture prerequisites are not all available.",
          flattenCapabilityReport(capabilities)
        );
      }
      if (!capabilities.readyForMediaDownload) {
        this.#logger.warn(
          "Tampermonkey media download API is unavailable."
        );
      }
      this.#initialised = true;
      this.#pageLifecycle?.start();
    }
    getCapabilities() {
      return detectRuntimeCapabilities({
        globalScope: this.#globalScope,
        gmRequest: this.#gmRequest,
        gmRegisterMenuCommand: this.#menu.available ? this.#menu.register : void 0
      });
    }
    reportCapabilities() {
      const report = flattenCapabilityReport(this.getCapabilities());
      this.#logger.info("Runtime capability report", report);
      if (typeof console.table === "function") {
        console.table(report);
      }
      return report;
    }
    inspectCurrentItem() {
      const itemRoute = resolveInstagramItemContext({
        locationHref: this.#globalScope?.location?.href,
        documentObject: this.#globalScope?.document
      });
      if (!itemRoute) {
        this.#logger.warn(
          "The active Instagram item could not be resolved unambiguously."
        );
        return null;
      }
      this.#logger.info("Current Instagram item", itemRoute);
      const metadata = extractInstagramMetadata({
        documentObject: this.#globalScope?.document,
        itemRoute
      });
      const mediaProbe = collectInstagramMediaProbe(
        this.#globalScope?.document,
        {
          width: this.#globalScope?.innerWidth,
          height: this.#globalScope?.innerHeight
        }
      );
      const classification = classifyMediaProbe({ itemRoute, probe: mediaProbe });
      this.#logger.info("Current Instagram metadata", metadata);
      this.#logger.info("Current Instagram media probe", {
        classification,
        mediaProbe
      });
      if (typeof console.table === "function") {
        console.table({
          routeKind: itemRoute.routeKind,
          contextSource: itemRoute.resolutionSource,
          postId: metadata.postId,
          canonicalUrl: metadata.canonicalUrl,
          author: metadata.author || "(unavailable)",
          caption: metadata.caption || "(unavailable)",
          proposedTitle: metadata.proposedTitle,
          authorSource: metadata.sources.author,
          captionSource: metadata.sources.caption,
          detectedContentType: classification.contentType,
          classificationConfidence: classification.confidence,
          selectedMediaCandidate: classification.selectedCandidateIndex ?? "(none)",
          selectedMediaSource: classification.selectedSourceFingerprint ?? "(none)",
          mediaCandidates: mediaProbe.candidates.length,
          substantialCandidates: classification.substantialCandidateCount,
          probeRegion: mediaProbe.regionKind,
          carouselControls: mediaProbe.carouselControlLabels.join(", ") || "(none)"
        });
        console.table(mediaProbe.candidates.map((candidate) => ({
          index: candidate.index,
          type: candidate.mediaType,
          intrinsic: candidate.intrinsicWidth + "x" + candidate.intrinsicHeight,
          rendered: candidate.renderedWidth + "x" + candidate.renderedHeight,
          visible: candidate.visible,
          inViewport: candidate.inViewport,
          substantial: candidate.substantial,
          hasSource: Boolean(candidate.source),
          sourceKey: candidate.sourceFingerprint,
          hasPoster: Boolean(candidate.poster),
          alt: candidate.alt.slice(0, 80)
        })));
      }
      return Object.freeze({ itemRoute, metadata, mediaProbe, classification });
    }
    async traverseCurrentCarousel() {
      const itemRoute = resolveInstagramItemContext({
        locationHref: this.#globalScope?.location?.href,
        documentObject: this.#globalScope?.document
      });
      if (!itemRoute || itemRoute.routeKind !== "post") {
        this.#logger.warn(
          "Carousel traversal requires an Instagram post permalink."
        );
        return null;
      }
      try {
        const driver = createInstagramCarouselDriver({
          documentObject: this.#globalScope?.document,
          globalScope: this.#globalScope
        });
        const result = await traverseCarousel({ driver });
        this.#logger.info("Ordered carousel traversal result", result);
        if (typeof console.table === "function") {
          console.table(result.media.map((item) => ({
            sequence: item.sequence,
            type: item.type,
            dimensions: item.width && item.height ? item.width + "x" + item.height : "unknown",
            sourceKey: fingerprintMediaSource(item.url)
          })));
        }
        this.#logger.info(
          "Original carousel position restored:",
          result.originalPositionRestored
        );
        return result;
      } catch (error) {
        this.#logger.error(
          "Carousel traversal stopped safely:",
          error?.code ?? error?.message ?? error
        );
        return null;
      }
    }
    async buildCurrentCaptureSnapshot() {
      try {
        const snapshot = await buildReadOnlyCaptureSnapshot({
          globalScope: this.#globalScope
        });
        const item = snapshot.captureItem;
        this.#logger.info("Read-only capture snapshot", snapshot);
        if (typeof console.table === "function") {
          console.table({
            contentType: item.contentType,
            postId: item.postId,
            author: item.author,
            proposedTitle: item.proposedTitle,
            mediaCount: item.mediaCount,
            physicalMediaFiles: item.media.length,
            contextSource: snapshot.diagnostics.contextSource,
            classificationConfidence: snapshot.diagnostics.classificationConfidence,
            warnings: snapshot.warnings.join(" | ") || "(none)"
          });
        }
        return snapshot;
      } catch (error) {
        this.#logger.error(
          "Capture snapshot stopped safely:",
          error?.code ?? error?.message ?? error
        );
        return null;
      }
    }
    async changeVault() {
      try {
        const handle = await this.#vaultManager?.configureVault();
        if (handle) this.#ui?.notify("Obsidian vault set to " + handle.name + ".");
      } catch (error) {
        if (error?.name !== "AbortError") {
          this.#ui?.notify(error?.message ?? "Unable to configure the vault.", { error: true });
        }
      }
    }
    async resetConfiguration() {
      const choice = await this.#ui?.chooseDecision({
        title: "Reset cached configuration",
        message: "Forget the cached vault and remembered preferences? No files will be deleted.",
        choices: [
          { label: "Cancel", value: "cancel" },
          { label: "Reset", value: "reset", danger: true }
        ]
      });
      if (choice !== "reset") return;
      await this.#settingsManager?.resetVault();
      await this.#settingsManager?.updateSettings({ lastMode: "obsidian", debug: false });
      this.#ui?.notify("Cached configuration reset. Existing files were not changed.");
    }
  };

  // src/tampermonkey/menu.js
  function createTampermonkeyMenuAdapter(registerMenuCommand) {
    if (typeof registerMenuCommand !== "function") {
      return Object.freeze({
        available: false,
        register() {
          return void 0;
        }
      });
    }
    return Object.freeze({
      available: true,
      register(label, handler) {
        if (typeof label !== "string" || label.trim() === "") {
          throw new TypeError("Menu command label must be non-empty.");
        }
        if (typeof handler !== "function") {
          throw new TypeError("Menu command handler must be a function.");
        }
        return registerMenuCommand(label, handler);
      }
    });
  }

  // src/utils/logging.js
  var LEVELS = Object.freeze({
    debug: 10,
    info: 20,
    warn: 30,
    error: 40
  });
  function createLogger({
    name = "InstagramCapture",
    level = "info",
    consoleObject = console
  } = {}) {
    if (!(level in LEVELS)) {
      throw new TypeError("Unknown log level: " + level);
    }
    const threshold = LEVELS[level];
    const logger = {};
    for (const [method, priority] of Object.entries(LEVELS)) {
      logger[method] = (...args) => {
        if (priority < threshold) {
          return;
        }
        const sink = consoleObject[method] ?? consoleObject.log;
        sink.call(consoleObject, "[" + name + "]", ...args);
      };
    }
    return Object.freeze(logger);
  }

  // src/filesystem/file-system.js
  function assertEntryName(name) {
    if (typeof name !== "string" || name.trim() === "" || name === "." || name === ".." || /[\\/]/u.test(name)) {
      throw new TypeError("Filesystem entry name must be one safe path segment.");
    }
  }
  function isNotFound(error) {
    return error?.name === "NotFoundError";
  }
  async function exists(getter) {
    try {
      await getter();
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }
  function createFileSystemService({ globalScope = globalThis } = {}) {
    return Object.freeze({
      async chooseDirectory(options = {}) {
        if (typeof globalScope.showDirectoryPicker !== "function") {
          throw new Error("The File System Access directory picker is unavailable.");
        }
        return globalScope.showDirectoryPicker({ mode: "readwrite", ...options });
      },
      async queryPermission(handle, mode = "readwrite") {
        if (!handle || typeof handle.queryPermission !== "function") {
          return "prompt";
        }
        return handle.queryPermission({ mode });
      },
      async ensurePermission(handle, mode = "readwrite") {
        if (!handle) {
          return false;
        }
        if (await this.queryPermission(handle, mode) === "granted") {
          return true;
        }
        if (typeof handle.requestPermission !== "function") {
          return false;
        }
        return await handle.requestPermission({ mode }) === "granted";
      },
      async getDirectory(parent, name, { create = false } = {}) {
        assertEntryName(name);
        return parent.getDirectoryHandle(name, { create });
      },
      async getDirectoryPath(parent, segments, { create = false } = {}) {
        if (!Array.isArray(segments)) {
          throw new TypeError("Directory path segments must be an array.");
        }
        let current = parent;
        for (const segment of segments) {
          current = await this.getDirectory(current, segment, { create });
        }
        return current;
      },
      async directoryExists(parent, name) {
        assertEntryName(name);
        return exists(() => parent.getDirectoryHandle(name));
      },
      async fileExists(parent, name) {
        assertEntryName(name);
        return exists(() => parent.getFileHandle(name));
      },
      async readFile(parent, name) {
        assertEntryName(name);
        const handle = await parent.getFileHandle(name);
        return handle.getFile();
      },
      async readText(parent, name) {
        return (await this.readFile(parent, name)).text();
      },
      async writeBlob(parent, name, blob, { overwrite = false } = {}) {
        assertEntryName(name);
        if (!(blob instanceof Blob)) {
          throw new TypeError("writeBlob requires a Blob.");
        }
        if (!overwrite && await this.fileExists(parent, name)) {
          const error = new Error("Refusing to overwrite existing file: " + name);
          error.code = "FILE_EXISTS";
          throw error;
        }
        const fileHandle = await parent.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable({ keepExistingData: false });
        try {
          await writable.write(blob);
          await writable.close();
        } catch (error) {
          await writable.abort?.().catch?.(() => {
          });
          throw error;
        }
        return fileHandle;
      },
      async writeText(parent, name, text, options) {
        if (typeof text !== "string") {
          throw new TypeError("writeText requires a string.");
        }
        return this.writeBlob(
          parent,
          name,
          new Blob([text], { type: "text/plain;charset=utf-8" }),
          options
        );
      },
      async removeEntry(parent, name, { recursive = false } = {}) {
        assertEntryName(name);
        return parent.removeEntry(name, { recursive });
      },
      async listDirectories(parent) {
        const directories = [];
        for await (const [name, handle] of parent.entries()) {
          if (handle.kind === "directory") {
            directories.push(Object.freeze({ name, handle }));
          }
        }
        return Object.freeze(directories.sort((a, b) => a.name.localeCompare(b.name, void 0, { sensitivity: "base" })));
      },
      async createUniqueDirectory(parent, baseName) {
        assertEntryName(baseName);
        let suffix = 1;
        while (suffix < 1e4) {
          const name = suffix === 1 ? baseName : baseName + " - " + suffix;
          if (!await this.directoryExists(parent, name)) {
            const handle = await parent.getDirectoryHandle(name, { create: true });
            return Object.freeze({ name, handle });
          }
          suffix += 1;
        }
        throw new Error("Unable to allocate a unique destination directory.");
      }
    });
  }

  // src/filesystem/vault-manager.js
  function createVaultManager({ fileSystem, settingsManager }) {
    if (!fileSystem || !settingsManager) {
      throw new TypeError("Filesystem and settings services are required.");
    }
    return Object.freeze({
      async configureVault() {
        const handle = await fileSystem.chooseDirectory({ id: "obsidian-vault" });
        if (!await fileSystem.ensurePermission(handle)) {
          throw new Error("Write permission for the selected vault was not granted.");
        }
        await settingsManager.setVaultHandle(handle);
        return handle;
      },
      async getVault({ allowSelection = true } = {}) {
        let handle = await settingsManager.getVaultHandle();
        if (handle && await fileSystem.ensurePermission(handle)) {
          return handle;
        }
        if (!allowSelection) {
          return null;
        }
        handle = await this.configureVault();
        return handle;
      },
      reset() {
        return settingsManager.resetVault();
      }
    });
  }

  // src/settings/indexeddb-store.js
  function createIndexedDbStore({
    indexedDB = globalThis.indexedDB,
    databaseName = "instagram-capture-utility",
    storeName = "configuration",
    version = 1
  } = {}) {
    if (!indexedDB || typeof indexedDB.open !== "function") {
      throw new Error("IndexedDB is unavailable.");
    }
    let databasePromise;
    function openDatabase() {
      databasePromise ??= new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, version);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(storeName)) {
            request.result.createObjectStore(storeName);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked."));
      });
      return databasePromise;
    }
    async function run(mode, operation) {
      const database = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let request;
        let result;
        try {
          request = operation(store);
        } catch (error) {
          reject(error);
          return;
        }
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => reject(request.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve(result);
      });
    }
    return Object.freeze({
      get(key) {
        return run("readonly", (store) => store.get(key));
      },
      async set(key, value) {
        await run("readwrite", (store) => store.put(value, key));
      },
      async delete(key) {
        await run("readwrite", (store) => store.delete(key));
      },
      async clear() {
        await run("readwrite", (store) => store.clear());
      }
    });
  }
  function createMemoryStore(initialEntries = []) {
    const values = new Map(initialEntries);
    return Object.freeze({
      async get(key) {
        return values.get(key);
      },
      async set(key, value) {
        values.set(key, value);
      },
      async delete(key) {
        values.delete(key);
      },
      async clear() {
        values.clear();
      }
    });
  }

  // src/settings/settings-manager.js
  var SETTINGS_KEY = "settings";
  var VAULT_HANDLE_KEY = "vault-handle";
  var DEFAULT_SETTINGS = Object.freeze({
    schemaVersion: APP_CONFIG.settingsSchemaVersion,
    instagramMediaPath: APP_CONFIG.mediaRootSegments.join("/"),
    lastMode: "obsidian",
    lastNoteRelativePath: "",
    debug: false
  });
  function normalizeSettings(value) {
    if (!value || value.schemaVersion !== APP_CONFIG.settingsSchemaVersion) {
      return { ...DEFAULT_SETTINGS };
    }
    return {
      ...DEFAULT_SETTINGS,
      lastMode: ["obsidian", "download"].includes(value.lastMode) ? value.lastMode : DEFAULT_SETTINGS.lastMode,
      lastNoteRelativePath: typeof value.lastNoteRelativePath === "string" ? value.lastNoteRelativePath : "",
      debug: value.debug === true
    };
  }
  function createSettingsManager(store) {
    if (!store || typeof store.get !== "function" || typeof store.set !== "function") {
      throw new TypeError("A key-value settings store is required.");
    }
    return Object.freeze({
      async getSettings() {
        return Object.freeze(normalizeSettings(await store.get(SETTINGS_KEY)));
      },
      async updateSettings(patch) {
        const current = await this.getSettings();
        const next = normalizeSettings({ ...current, ...patch });
        await store.set(SETTINGS_KEY, next);
        return Object.freeze(next);
      },
      getVaultHandle() {
        return store.get(VAULT_HANDLE_KEY);
      },
      async setVaultHandle(handle) {
        if (!handle || handle.kind !== "directory") {
          throw new TypeError("Vault handle must be a directory handle.");
        }
        await store.set(VAULT_HANDLE_KEY, handle);
      },
      async resetVault() {
        await store.delete(VAULT_HANDLE_KEY);
        await this.updateSettings({ lastNoteRelativePath: "" });
      }
    });
  }

  // src/network/tampermonkey-network.js
  function parseResponseHeaders(rawHeaders = "") {
    const headers = {};
    for (const line of rawHeaders.split(/\r?\n/u)) {
      const separator = line.indexOf(":");
      if (separator < 1) {
        continue;
      }
      const name = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).trim();
      headers[name] = headers[name] ? headers[name] + ", " + value : value;
    }
    return Object.freeze(headers);
  }
  function createTampermonkeyBinaryRequest(gmRequest2) {
    if (typeof gmRequest2 !== "function") {
      throw new TypeError("GM_xmlhttpRequest is required.");
    }
    return function requestBinary({ url, timeoutMs }) {
      return new Promise((resolve, reject) => {
        gmRequest2({
          method: "GET",
          url,
          responseType: "blob",
          timeout: timeoutMs,
          onload(response) {
            resolve(Object.freeze({
              status: response.status,
              statusText: response.statusText ?? "",
              headers: parseResponseHeaders(response.responseHeaders),
              body: response.response,
              finalUrl: response.finalUrl || url
            }));
          },
          onerror() {
            reject(new Error("Tampermonkey network request failed."));
          },
          ontimeout() {
            reject(new Error("Tampermonkey network request timed out."));
          },
          onabort() {
            reject(new Error("Tampermonkey network request was aborted."));
          }
        });
      });
    };
  }

  // src/network/media-format.js
  var MIME_FORMATS = Object.freeze({
    "image/jpeg": Object.freeze({ mediaType: "image", extension: "jpg" }),
    "image/png": Object.freeze({ mediaType: "image", extension: "png" }),
    "image/webp": Object.freeze({ mediaType: "image", extension: "webp" }),
    "image/avif": Object.freeze({ mediaType: "image", extension: "avif" }),
    "video/mp4": Object.freeze({ mediaType: "video", extension: "mp4" })
  });
  function normalizeMimeType(value) {
    return typeof value === "string" ? value.split(";", 1)[0].trim().toLowerCase() : "";
  }
  function ascii(bytes, start, length) {
    return String.fromCharCode(...bytes.slice(start, start + length));
  }
  function sniffMimeType(bytes) {
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
      return "image/jpeg";
    }
    if (bytes[0] === 137 && ascii(bytes, 1, 3) === "PNG" && bytes[4] === 13 && bytes[5] === 10) {
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
  async function validateMediaBlob({ blob, expectedMediaType, declaredMimeType }) {
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
        "Downloaded media has an unsupported or unverified content type."
      );
    }
    if (format.mediaType !== expectedMediaType) {
      throw new TypeError(
        "Downloaded media type does not match the extracted media model."
      );
    }
    if (MIME_FORMATS[declared] && declared !== sniffed) {
      throw new TypeError(
        "Downloaded media signature conflicts with its declared content type."
      );
    }
    return Object.freeze({
      blob: blob.type === mimeType ? blob : blob.slice(0, blob.size, mimeType),
      mimeType,
      extension: format.extension
    });
  }

  // src/network/downloader.js
  var TRANSIENT_STATUS_CODES = /* @__PURE__ */ new Set([408, 425, 429]);
  var MediaDownloadError = class extends Error {
    constructor(message, code, options) {
      super(message, options);
      this.name = "MediaDownloadError";
      this.code = code;
    }
  };
  function isTransientStatus(status) {
    return TRANSIENT_STATUS_CODES.has(status) || status >= 500;
  }
  function assertMediaUrl(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new MediaDownloadError("Media URL is invalid.", "INVALID_URL");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new MediaDownloadError(
        "Media URL must use HTTP or HTTPS.",
        "INVALID_URL"
      );
    }
  }
  function normalizeBody(body, contentType) {
    if (body instanceof Blob) {
      return body;
    }
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      return new Blob([body], { type: contentType || "" });
    }
    throw new MediaDownloadError(
      "Media response did not contain binary data.",
      "INVALID_BODY"
    );
  }
  function createMediaDownloader({
    requestBinary,
    timeoutMs = 3e4,
    maxAttempts = 2
  }) {
    if (typeof requestBinary !== "function") {
      throw new TypeError("requestBinary must be a function.");
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
      throw new TypeError("timeoutMs must be a positive integer.");
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new TypeError("maxAttempts must be a positive integer.");
    }
    return Object.freeze({
      async download(mediaItem) {
        assertMediaUrl(mediaItem?.url);
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            const response = await requestBinary({
              url: mediaItem.url,
              timeoutMs
            });
            if (response.status < 200 || response.status >= 300) {
              const error = new MediaDownloadError(
                "Media request returned HTTP " + response.status + ".",
                "HTTP_ERROR"
              );
              error.status = response.status;
              if (isTransientStatus(response.status) && attempt < maxAttempts) {
                lastError = error;
                continue;
              }
              throw error;
            }
            const declaredMimeType = response.headers?.["content-type"] ?? "";
            const blob = normalizeBody(response.body, declaredMimeType);
            let validated;
            try {
              validated = await validateMediaBlob({
                blob,
                expectedMediaType: mediaItem.type,
                declaredMimeType
              });
            } catch (error) {
              throw new MediaDownloadError(
                "Downloaded media failed content validation.",
                "INVALID_MEDIA",
                { cause: error }
              );
            }
            return Object.freeze({
              ...validated,
              sourceUrl: mediaItem.url,
              finalUrl: response.finalUrl || mediaItem.url,
              status: response.status
            });
          } catch (error) {
            if (error instanceof MediaDownloadError) {
              throw error;
            }
            lastError = new MediaDownloadError(
              "Media network request failed.",
              "NETWORK_ERROR",
              { cause: error }
            );
            if (attempt === maxAttempts) {
              throw lastError;
            }
          }
        }
        throw lastError;
      }
    });
  }

  // src/markdown/generator.js
  function yamlString(value) {
    return JSON.stringify(String(value));
  }
  function safeHeading(value) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError("Markdown title must be non-empty.");
    }
    return value.replace(/[\r\n]+/gu, " ").trim();
  }
  function validateEmbedPath(path) {
    if (typeof path !== "string" || path.trim() === "" || /[\r\n]/u.test(path) || path.includes("[[") || path.includes("]]")) {
      throw new TypeError("Media embed path is unsafe.");
    }
    return path.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
  }
  function generateObsidianMarkdown({ captureItem, title, mediaPaths }) {
    if (!captureItem || !Array.isArray(captureItem.media)) {
      throw new TypeError("A CaptureItem is required.");
    }
    if (!Array.isArray(mediaPaths) || mediaPaths.length !== captureItem.media.length) {
      throw new TypeError("Media paths must correspond one-to-one with media items.");
    }
    const heading = safeHeading(title);
    const embeds = mediaPaths.map(validateEmbedPath);
    const sourceKind = captureItem.contentType === "reel" ? "reel" : "post";
    const lines = [
      "---",
      "source: instagram",
      "content_type: " + yamlString(captureItem.contentType),
      "instagram_id: " + yamlString(captureItem.postId),
      "author: " + yamlString(captureItem.author),
      "url: " + yamlString(captureItem.canonicalUrl),
      "captured: " + yamlString(captureItem.capturedAt),
      "media_count: " + captureItem.mediaCount,
      "---",
      "",
      "# " + heading,
      "",
      "## Source",
      "",
      "Instagram " + sourceKind + " by @" + captureItem.author,
      "",
      captureItem.canonicalUrl,
      "",
      "## Caption",
      "",
      captureItem.caption,
      "",
      "## Media",
      ""
    ];
    for (const path of embeds) {
      lines.push("![[" + path + "]]", "");
    }
    return lines.join("\n").trimEnd() + "\n";
  }

  // src/storage/media-filenames.js
  var EXTENSION_PATTERN = /^[a-z0-9]+$/u;
  function assertPostId(postId) {
    if (typeof postId !== "string" || !/^[A-Za-z0-9_-]+$/u.test(postId)) {
      throw new TypeError("postId must be a canonical Instagram ID.");
    }
  }
  function planMediaFilenames({ captureItem, downloads }) {
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
        if (extension !== "jpg") {
          throw new TypeError("Reel cover downloads must be validated JPEG files.");
        }
        basename = captureItem.postId + "-cover";
      } else if (media.role === "primary") {
        basename = captureItem.postId + "-" + String(media.sequence).padStart(sequenceWidth, "0");
      } else {
        throw new TypeError("Unsupported auxiliary media purpose.");
      }
      return Object.freeze({
        media,
        download,
        filename: basename + "." + extension
      });
    }));
  }

  // src/network/download-capture-media.js
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
      media
    });
  }
  async function downloadCaptureMedia({
    captureItem,
    downloader,
    onProgress = () => {
    }
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
        media
      }));
      try {
        const download = await downloader.download(media);
        if (media.role === "auxiliary" && media.purpose === "cover" && download.extension !== "jpg") {
          warnings.push(
            "Optional reel cover was not supplied as a validated JPEG and was omitted."
          );
          continue;
        }
        successfulMedia.push(media);
        downloads.push(download);
      } catch (error) {
        if (media.role === "auxiliary") {
          warnings.push(
            "Optional " + (media.purpose || media.type) + " media could not be downloaded."
          );
          continue;
        }
        throw error;
      }
    }
    const finalizedCaptureItem = rebuildCaptureItem(
      captureItem,
      successfulMedia
    );
    const files = planMediaFilenames({
      captureItem: finalizedCaptureItem,
      downloads
    });
    onProgress(Object.freeze({
      phase: "complete",
      completed: files.length,
      total: captureItem.media.length
    }));
    return Object.freeze({
      captureItem: finalizedCaptureItem,
      files,
      warnings: Object.freeze(warnings)
    });
  }

  // src/utils/filename.js
  var FILESYSTEM_UNSAFE = /[<>:"/\\|?*\u0000-\u001f\u007f]+/gu;
  var OBSIDIAN_LINK_UNSAFE = /[#\^\[\]]+/gu;
  var ANY_UNSAFE_REPLACEMENT = /[<>:"/\\|?*#\^\[\]\u0000-\u001f\u007f]/u;
  var WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
  function escapeRegExp(value) {
    return value.replace(/[/\\^$*+?.()|[\]{}]/gu, "\\$&");
  }
  function assertLength(maxLength) {
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      throw new RangeError("maxLength must be a positive integer.");
    }
  }
  function trimUnsafeEdges(value, replacement) {
    const escapedReplacement = escapeRegExp(replacement);
    return value.trim().replace(/[. ]+$/gu, "").replace(
      new RegExp(
        "^(?:" + escapedReplacement + "\\s*)+|(?:\\s*" + escapedReplacement + ")+$",
        "gu"
      ),
      ""
    ).trim().replace(/[. ]+$/gu, "");
  }
  function sanitizePathComponent(input, {
    fallback = "Instagram",
    maxLength = 120,
    replacement = "-"
  } = {}) {
    assertLength(maxLength);
    if (typeof replacement !== "string" || replacement.length !== 1 || ANY_UNSAFE_REPLACEMENT.test(replacement)) {
      throw new TypeError(
        "replacement must be one filesystem-safe character."
      );
    }
    let value = String(input ?? "").normalize("NFC").replace(FILESYSTEM_UNSAFE, " " + replacement + " ").replace(OBSIDIAN_LINK_UNSAFE, " " + replacement + " ").replace(/\s+/gu, " ");
    const repeatedReplacement = new RegExp(
      "(?:\\s*" + escapeRegExp(replacement) + "\\s*){2,}",
      "gu"
    );
    value = trimUnsafeEdges(
      value.replace(repeatedReplacement, " " + replacement + " "),
      replacement
    );
    if (value.length > maxLength) {
      value = trimUnsafeEdges(value.slice(0, maxLength), replacement);
    }
    if (value === "") {
      value = String(fallback ?? "").normalize("NFC").replace(FILESYSTEM_UNSAFE, " " + replacement + " ").replace(OBSIDIAN_LINK_UNSAFE, " " + replacement + " ").replace(/\s+/gu, " ").replace(repeatedReplacement, " " + replacement + " ");
      value = trimUnsafeEdges(value.slice(0, maxLength), replacement);
    }
    if (WINDOWS_RESERVED_NAME.test(value)) {
      const reservedSuffix = replacement + "item";
      value = trimUnsafeEdges(
        value.slice(0, Math.max(1, maxLength - reservedSuffix.length)) + reservedSuffix,
        replacement
      );
    }
    return value || "Instagram".slice(0, maxLength);
  }
  function buildItemDirectoryName(title, postId, { collisionNumber, maxLength = 160 } = {}) {
    assertLength(maxLength);
    if (typeof postId !== "string" || !/^[A-Za-z0-9_-]+$/u.test(postId)) {
      throw new TypeError("postId must be a canonical Instagram ID.");
    }
    if (collisionNumber !== void 0 && (!Number.isInteger(collisionNumber) || collisionNumber < 2)) {
      throw new RangeError(
        "collisionNumber must be an integer greater than or equal to 2."
      );
    }
    const collisionSuffix = collisionNumber === void 0 ? "" : " - " + collisionNumber;
    const identitySuffix = " - " + postId + collisionSuffix;
    const titleBudget = maxLength - identitySuffix.length;
    if (titleBudget < 1) {
      throw new RangeError(
        "maxLength is too small to preserve the canonical Post ID."
      );
    }
    const safeTitle = sanitizePathComponent(title, {
      fallback: "Instagram",
      maxLength: titleBudget
    });
    return safeTitle + identitySuffix;
  }
  function buildNoteFilename(title, { maxLength = 160 } = {}) {
    const extension = ".md";
    assertLength(maxLength);
    if (maxLength <= extension.length) {
      throw new RangeError("maxLength is too small for a Markdown file.");
    }
    const titleWithoutExtension = String(title ?? "").replace(
      /\.md\s*$/iu,
      ""
    );
    return sanitizePathComponent(titleWithoutExtension, {
      fallback: "Instagram",
      maxLength: maxLength - extension.length
    }) + extension;
  }

  // src/storage/capture-state.js
  var INCOMPLETE_MARKER = ".capture-incomplete.json";
  var COMPLETE_MARKER = ".capture-complete.json";
  function validPostId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]+$/u.test(value);
  }
  function validPath(value) {
    return typeof value === "string" && value.trim() !== "" && !/[\r\n]/u.test(value) && !value.split(/[\\/]/u).includes("..");
  }
  function validTimestamp(value) {
    return typeof value === "string" && !Number.isNaN(Date.parse(value));
  }
  function validateBase(value) {
    return Boolean(value) && value.schemaVersion === APP_CONFIG.captureStateSchemaVersion && validPostId(value.postId) && validPath(value.notePath);
  }
  function createIncompleteMarker({ postId, notePath, startedAt }) {
    const marker = { schemaVersion: APP_CONFIG.captureStateSchemaVersion, postId, notePath, startedAt };
    if (!validateBase(marker) || !validTimestamp(startedAt)) {
      throw new TypeError("Incomplete capture marker fields are invalid.");
    }
    return Object.freeze(marker);
  }
  function createCompleteMarker({ postId, notePath, mediaFilenames, completedAt }) {
    const marker = {
      schemaVersion: APP_CONFIG.captureStateSchemaVersion,
      postId,
      notePath,
      mediaFilenames,
      completedAt
    };
    if (!validateBase(marker) || !validTimestamp(completedAt) || !Array.isArray(mediaFilenames) || mediaFilenames.length < 1 || mediaFilenames.some((name) => typeof name !== "string" || name === "" || /[\\/]/u.test(name))) {
      throw new TypeError("Complete capture marker fields are invalid.");
    }
    return Object.freeze({ ...marker, mediaFilenames: Object.freeze([...mediaFilenames]) });
  }
  function parseMarker(text, type) {
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      return Object.freeze({ status: "malformed", reason: "invalid-json" });
    }
    try {
      const marker = type === "complete" ? createCompleteMarker(value) : createIncompleteMarker(value);
      return Object.freeze({ status: "valid", marker });
    } catch {
      return Object.freeze({ status: "malformed", reason: "invalid-schema" });
    }
  }
  async function readMarker(fileSystem, directory, filename, type) {
    if (!await fileSystem.fileExists(directory, filename)) {
      return Object.freeze({ status: "missing" });
    }
    try {
      return parseMarker(await fileSystem.readText(directory, filename), type);
    } catch {
      return Object.freeze({ status: "malformed", reason: "unreadable" });
    }
  }
  async function inspectCaptureState({ fileSystem, directory, postId }) {
    const [complete, incomplete] = await Promise.all([
      readMarker(fileSystem, directory, COMPLETE_MARKER, "complete"),
      readMarker(fileSystem, directory, INCOMPLETE_MARKER, "incomplete")
    ]);
    if (complete.status === "malformed" || incomplete.status === "malformed") {
      return Object.freeze({ kind: "conflict", reason: "malformed-marker" });
    }
    if (complete.status === "valid") {
      if (complete.marker.postId !== postId) {
        return Object.freeze({ kind: "conflict", reason: "identity-mismatch" });
      }
      return Object.freeze({ kind: "complete", marker: complete.marker, staleIncomplete: incomplete.status === "valid" });
    }
    if (incomplete.status === "valid") {
      if (incomplete.marker.postId !== postId) {
        return Object.freeze({ kind: "conflict", reason: "identity-mismatch" });
      }
      return Object.freeze({ kind: "incomplete", marker: incomplete.marker });
    }
    return Object.freeze({ kind: "untracked" });
  }
  async function writeIncompleteMarker({ fileSystem, directory, marker, overwrite = false }) {
    return fileSystem.writeText(directory, INCOMPLETE_MARKER, JSON.stringify(marker, null, 2) + "\n", { overwrite });
  }
  async function writeCompleteMarker({ fileSystem, directory, marker }) {
    return fileSystem.writeText(directory, COMPLETE_MARKER, JSON.stringify(marker, null, 2) + "\n", { overwrite: false });
  }
  async function removeIncompleteMarkerBestEffort({ fileSystem, directory }) {
    try {
      if (await fileSystem.fileExists(directory, INCOMPLETE_MARKER)) {
        await fileSystem.removeEntry(directory, INCOMPLETE_MARKER);
      }
      return true;
    } catch {
      return false;
    }
  }
  async function findManagedCaptureDirectory({ fileSystem, mediaRoot, postId }) {
    if (!validPostId(postId)) {
      throw new TypeError("postId must be a canonical Instagram ID.");
    }
    const suffix = " - " + postId;
    const matches = (await fileSystem.listDirectories(mediaRoot)).filter(({ name }) => name.endsWith(suffix));
    if (matches.length > 1) {
      const error = new Error("Multiple managed directories match the Post ID.");
      error.code = "AMBIGUOUS_CAPTURE_DIRECTORIES";
      throw error;
    }
    return matches[0] ?? null;
  }

  // src/storage/errors.js
  var StorageError = class extends Error {
    constructor(message, code, options) {
      super(message, options);
      this.name = "StorageError";
      this.code = code;
    }
  };

  // src/storage/note-target.js
  async function allocateNoteTarget({ fileSystem, directory, title, onCollision }) {
    const proposed = buildNoteFilename(title);
    if (!await fileSystem.fileExists(directory, proposed)) {
      return Object.freeze({ filename: proposed, overwrite: false });
    }
    const choice = await onCollision?.(proposed);
    if (choice === "replace") {
      return Object.freeze({ filename: proposed, overwrite: true });
    }
    if (choice === "copy") {
      for (let suffix = 2; suffix < 1e4; suffix += 1) {
        const filename = buildNoteFilename(title + " - " + suffix);
        if (!await fileSystem.fileExists(directory, filename)) {
          return Object.freeze({ filename, overwrite: false });
        }
      }
      throw new StorageError("Unable to allocate a copy note filename.", "NOTE_COPY_EXHAUSTED");
    }
    throw new StorageError("Capture cancelled at note collision.", "CANCELLED");
  }
  function splitVaultRelativeFilePath(path) {
    if (typeof path !== "string" || path.trim() === "") {
      throw new StorageError("Stored note path is invalid.", "INVALID_NOTE_PATH");
    }
    const segments = path.replace(/\\/gu, "/").split("/").filter(Boolean);
    if (segments.length < 1 || segments.some((segment) => segment === ".." || segment === ".")) {
      throw new StorageError("Stored note path is unsafe.", "INVALID_NOTE_PATH");
    }
    return Object.freeze({ directorySegments: Object.freeze(segments.slice(0, -1)), filename: segments.at(-1) });
  }
  function inspectManagedNote(text, postId, mediaDirectoryName) {
    if (typeof text !== "string") {
      return Object.freeze({ valid: false, reason: "unreadable-note" });
    }
    const idMatch = text.match(/^instagram_id:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/mu);
    if (!idMatch || idMatch[1] !== postId) {
      return Object.freeze({ valid: false, reason: "identity-mismatch" });
    }
    const filenames = [];
    const ownedFilename = new RegExp(
      "^" + postId + "(?:-\\d+|-cover)?\\.(?:jpg|png|webp|avif|mp4)$",
      "u"
    );
    for (const match of text.matchAll(/!\[\[([^\]\r\n]+)\]\]/gu)) {
      const path = match[1].replace(/\\/gu, "/");
      const segments = path.split("/");
      const filename = segments.at(-1);
      if (segments.at(-2) === mediaDirectoryName && filename && ownedFilename.test(filename)) {
        filenames.push(filename);
      }
    }
    if (filenames.length < 1) {
      return Object.freeze({ valid: false, reason: "missing-media-links" });
    }
    return Object.freeze({ valid: true, mediaFilenames: Object.freeze([...new Set(filenames)]) });
  }

  // src/storage/obsidian-storage.js
  function joinPath(segments) {
    return segments.filter(Boolean).join("/");
  }
  async function validateExistingRecoveryNote({
    fileSystem,
    vault,
    mediaDirectory,
    mediaDirectoryName,
    marker
  }) {
    const target = splitVaultRelativeFilePath(marker.notePath);
    let noteDirectory;
    try {
      noteDirectory = await fileSystem.getDirectoryPath(vault, target.directorySegments);
    } catch {
      throw new StorageError(
        "The intended recovery note directory no longer exists.",
        "RECOVERY_NOTE_DIRECTORY_MISSING"
      );
    }
    if (!await fileSystem.fileExists(noteDirectory, target.filename)) {
      return Object.freeze({ exists: false, noteDirectory, target });
    }
    const inspected = inspectManagedNote(
      await fileSystem.readText(noteDirectory, target.filename),
      marker.postId,
      mediaDirectoryName
    );
    if (!inspected.valid) {
      throw new StorageError("Existing recovery note conflicts with capture state.", "RECOVERY_NOTE_CONFLICT");
    }
    for (const filename of inspected.mediaFilenames) {
      if (!await fileSystem.fileExists(mediaDirectory, filename)) {
        throw new StorageError("Existing recovery note references missing media.", "RECOVERY_MEDIA_MISSING");
      }
    }
    return Object.freeze({ exists: true, noteDirectory, target, mediaFilenames: inspected.mediaFilenames });
  }
  function createObsidianStorageProvider({ fileSystem, downloader, now = () => (/* @__PURE__ */ new Date()).toISOString() }) {
    async function preflight({ vault, postId }) {
      if (!await fileSystem.ensurePermission(vault)) {
        throw new StorageError("Write permission for the Obsidian vault was denied.", "PERMISSION_DENIED");
      }
      const mediaRoot = await fileSystem.getDirectoryPath(vault, APP_CONFIG.mediaRootSegments, { create: true });
      const existing = await findManagedCaptureDirectory({ fileSystem, mediaRoot, postId });
      if (!existing) {
        return Object.freeze({ kind: "new", mediaRoot });
      }
      const state = await inspectCaptureState({ fileSystem, directory: existing.handle, postId });
      if (state.kind === "complete") {
        await removeIncompleteMarkerBestEffort({ fileSystem, directory: existing.handle });
        throw new StorageError("This Instagram item already exists in the vault.", "DUPLICATE_CAPTURE");
      }
      if (state.kind !== "incomplete") {
        throw new StorageError("Existing capture directory has ambiguous or untracked state.", "CAPTURE_STATE_CONFLICT");
      }
      return Object.freeze({ kind: "incomplete", mediaRoot, existing, state });
    }
    return Object.freeze({
      preflight,
      async save({
        captureItem,
        title,
        vault,
        noteDirectory,
        noteDirectorySegments = [],
        onNoteCollision,
        onRecovery,
        onProgress
      }) {
        const checked = await preflight({ vault, postId: captureItem.postId });
        const { mediaRoot } = checked;
        const existing = checked.kind === "incomplete" ? checked.existing : null;
        let mediaDirectory;
        let mediaDirectoryName;
        let noteTarget;
        let recovering = false;
        if (existing) {
          mediaDirectory = existing.handle;
          mediaDirectoryName = existing.name;
          const state = checked.state;
          const existingNote = await validateExistingRecoveryNote({
            fileSystem,
            vault,
            mediaDirectory,
            mediaDirectoryName,
            marker: state.marker
          });
          if (existingNote.exists) {
            const completeMarker2 = createCompleteMarker({
              postId: captureItem.postId,
              notePath: state.marker.notePath,
              mediaFilenames: existingNote.mediaFilenames,
              completedAt: now()
            });
            await writeCompleteMarker({ fileSystem, directory: mediaDirectory, marker: completeMarker2 });
            await removeIncompleteMarkerBestEffort({ fileSystem, directory: mediaDirectory });
            return Object.freeze({ mode: "obsidian", recoveredByFinalization: true, notePath: state.marker.notePath, files: existingNote.mediaFilenames, warnings: Object.freeze([]) });
          }
          if (await onRecovery?.(state.marker) !== "continue") {
            throw new StorageError("Interrupted capture recovery was cancelled.", "CANCELLED");
          }
          recovering = true;
          noteTarget = existingNote.target;
          noteDirectory = existingNote.noteDirectory ?? await fileSystem.getDirectoryPath(vault, noteTarget.directorySegments);
        } else {
          if (!noteDirectory) {
            throw new StorageError("A vault-relative note destination is required.", "NOTE_DESTINATION_REQUIRED");
          }
          noteTarget = await allocateNoteTarget({ fileSystem, directory: noteDirectory, title, onCollision: onNoteCollision });
          mediaDirectoryName = buildItemDirectoryName(title, captureItem.postId);
          mediaDirectory = await fileSystem.getDirectory(mediaRoot, mediaDirectoryName, { create: true });
          const notePath2 = joinPath([...noteDirectorySegments, noteTarget.filename]);
          const incompleteMarker = createIncompleteMarker({ postId: captureItem.postId, notePath: notePath2, startedAt: now() });
          await writeIncompleteMarker({ fileSystem, directory: mediaDirectory, marker: incompleteMarker });
        }
        const notePath = recovering ? joinPath([...noteTarget.directorySegments, noteTarget.filename]) : joinPath([...noteDirectorySegments, noteTarget.filename]);
        const downloaded = await downloadCaptureMedia({ captureItem, downloader, onProgress });
        for (const file of downloaded.files) {
          await fileSystem.writeBlob(mediaDirectory, file.filename, file.download.blob, { overwrite: recovering });
        }
        const mediaPaths = downloaded.files.map(({ filename }) => joinPath([...APP_CONFIG.mediaRootSegments, mediaDirectoryName, filename]));
        const markdown = generateObsidianMarkdown({ captureItem: downloaded.captureItem, title, mediaPaths });
        await fileSystem.writeText(noteDirectory, noteTarget.filename, markdown, {
          overwrite: recovering ? false : noteTarget.overwrite
        });
        const completeMarker = createCompleteMarker({
          postId: captureItem.postId,
          notePath,
          mediaFilenames: downloaded.files.map(({ filename }) => filename),
          completedAt: now()
        });
        await writeCompleteMarker({ fileSystem, directory: mediaDirectory, marker: completeMarker });
        const cleaned = await removeIncompleteMarkerBestEffort({ fileSystem, directory: mediaDirectory });
        return Object.freeze({
          mode: "obsidian",
          recoveredByFinalization: false,
          notePath,
          files: Object.freeze(downloaded.files.map(({ filename }) => filename)),
          warnings: Object.freeze([
            ...downloaded.warnings,
            ...cleaned ? [] : ["Capture completed, but the stale incomplete marker could not be removed."]
          ])
        });
      }
    });
  }

  // src/storage/download-storage.js
  function createDownloadStorageProvider({ fileSystem, downloader }) {
    return Object.freeze({
      async save({ captureItem, title, parentDirectory, onProgress }) {
        if (!await fileSystem.ensurePermission(parentDirectory)) {
          throw new Error("Write permission for the download destination was denied.");
        }
        const directoryName = buildItemDirectoryName(title, captureItem.postId);
        const destination = await fileSystem.createUniqueDirectory(parentDirectory, directoryName);
        const downloaded = await downloadCaptureMedia({ captureItem, downloader, onProgress });
        for (const file of downloaded.files) {
          await fileSystem.writeBlob(destination.handle, file.filename, file.download.blob, { overwrite: false });
        }
        return Object.freeze({
          mode: "download",
          directoryName: destination.name,
          files: Object.freeze(downloaded.files.map(({ filename }) => filename)),
          warnings: downloaded.warnings
        });
      }
    });
  }

  // src/ui/app-ui.js
  var HOST_ID = "instagram-capture-utility-host";
  var STYLES = `
  :host { all: initial; color-scheme: light dark; }
  * { box-sizing: border-box; }
  button, input { font: inherit; }
  .capture { position: fixed; right: 24px; bottom: 24px; z-index: 2147483646;
    border: 0; border-radius: 999px; padding: 12px 18px; cursor: pointer;
    background: #7c3aed; color: white; font: 600 14px/1.2 system-ui, sans-serif;
    box-shadow: 0 8px 28px #0006; }
  .capture:hover { background: #6d28d9; }
  .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid;
    place-items: center; padding: 20px; background: #0009; font: 14px/1.45 system-ui, sans-serif; }
  .panel { width: min(560px, 100%); max-height: min(760px, 92vh); overflow: auto;
    border: 1px solid #ffffff24; border-radius: 14px; padding: 22px;
    background: #18181b; color: #fafafa; box-shadow: 0 24px 80px #000a; }
  h2 { margin: 0 0 8px; font-size: 20px; } p { margin: 8px 0; }
  .muted { color: #a1a1aa; } .warning { color: #fbbf24; }
  label { display: block; margin: 16px 0 6px; font-weight: 600; }
  input[type=text] { width: 100%; border: 1px solid #52525b; border-radius: 8px;
    padding: 10px 12px; background: #27272a; color: #fafafa; }
  .check { display: flex; gap: 9px; align-items: center; font-weight: 500; }
  .actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
  .action { border: 1px solid #52525b; border-radius: 8px; padding: 9px 14px;
    cursor: pointer; background: #27272a; color: #fafafa; }
  .primary { border-color: #7c3aed; background: #7c3aed; }
  .danger { border-color: #dc2626; background: #991b1b; }
  .path { margin: 14px 0; padding: 10px; border-radius: 8px; background: #27272a;
    overflow-wrap: anywhere; }
  .folders { display: grid; gap: 6px; min-height: 80px; }
  .folder { width: 100%; text-align: left; }
  .toast { position: fixed; right: 24px; bottom: 84px; z-index: 2147483647;
    max-width: min(420px, calc(100vw - 48px)); border-radius: 10px; padding: 12px 15px;
    background: #18181b; color: #fafafa; border: 1px solid #ffffff24;
    font: 14px/1.4 system-ui, sans-serif; box-shadow: 0 10px 35px #0008; }
  .progress { height: 8px; overflow: hidden; border-radius: 999px; background: #3f3f46; margin-top: 14px; }
  .progress > span { display: block; height: 100%; background: #7c3aed; transition: width .2s; }
`;
  function append(parent, tag, text, className) {
    const element = parent.ownerDocument.createElement(tag);
    if (text !== void 0) element.textContent = text;
    if (className) element.className = className;
    parent.append(element);
    return element;
  }
  function createAppUi({ documentObject = document } = {}) {
    const existing = documentObject.getElementById(HOST_ID);
    existing?.remove();
    const host = documentObject.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = documentObject.createElement("style");
    style.textContent = STYLES;
    shadow.append(style);
    documentObject.documentElement.append(host);
    const captureButton = append(shadow, "button", "Save Instagram item", "capture");
    captureButton.type = "button";
    captureButton.hidden = true;
    let captureHandler = null;
    captureButton.addEventListener("click", () => captureHandler?.());
    let backdrop = null;
    let toastTimer = null;
    let cancelModal = null;
    shadow.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && cancelModal) {
        event.preventDefault();
        cancelModal();
      }
    });
    function closeModal() {
      backdrop?.remove();
      backdrop = null;
      cancelModal = null;
    }
    function openModal(title) {
      closeModal();
      backdrop = append(shadow, "div", void 0, "backdrop");
      const panel = append(backdrop, "section", void 0, "panel");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      append(panel, "h2", title);
      return panel;
    }
    function action(parent, label, className = "") {
      const button = append(parent, "button", label, "action " + className);
      button.type = "button";
      return button;
    }
    return Object.freeze({
      destroy() {
        host.remove();
      },
      setCaptureAvailable(available, handler, label = "Save Instagram item") {
        captureButton.hidden = !available;
        captureButton.textContent = label;
        captureHandler = available ? handler : null;
      },
      showBusy(message) {
        const panel = openModal("Instagram Capture");
        append(panel, "p", message, "muted");
        const progress = append(panel, "div", void 0, "progress");
        append(progress, "span").style.width = "35%";
      },
      showProgress(event) {
        if (!backdrop) this.showBusy("Preparing capture…");
        const panel = backdrop.querySelector(".panel");
        const message = panel.querySelector("p") ?? append(panel, "p", "");
        if (event.phase === "downloading") {
          message.textContent = "Downloading media " + event.index + " of " + event.total + "…";
          panel.querySelector(".progress > span").style.width = Math.round((event.index - 1) / event.total * 100) + "%";
        } else if (event.phase === "complete") {
          message.textContent = "Writing capture…";
          panel.querySelector(".progress > span").style.width = "100%";
        }
      },
      closeModal,
      notify(message, { error = false, duration = 6e3 } = {}) {
        shadow.querySelector(".toast")?.remove();
        clearTimeout(toastTimer);
        const toast = append(shadow, "div", message, "toast" + (error ? " warning" : ""));
        toast.setAttribute("role", "status");
        toastTimer = setTimeout(() => toast.remove(), duration);
      },
      showCaptureOptions({ captureItem, warnings = [], defaultMode = "obsidian" }) {
        const panel = openModal("Instagram Capture");
        append(panel, "p", "@" + captureItem.author, "muted");
        append(panel, "p", captureItem.contentType + " • " + captureItem.mediaCount + " media item" + (captureItem.mediaCount === 1 ? "" : "s"));
        for (const warning of warnings) append(panel, "p", warning, "warning");
        const modeLabel = append(panel, "label", void 0, "check");
        const checkbox = append(modeLabel, "input");
        checkbox.type = "checkbox";
        checkbox.checked = defaultMode === "obsidian";
        append(modeLabel, "span", "Save to Obsidian vault");
        const titleLabel = append(panel, "label", "Note / folder title");
        titleLabel.htmlFor = "instagram-capture-title";
        const titleInput = append(panel, "input");
        titleInput.id = "instagram-capture-title";
        titleInput.type = "text";
        titleInput.value = captureItem.proposedTitle;
        const actions = append(panel, "div", void 0, "actions");
        const cancel = action(actions, "Cancel");
        const proceed = action(actions, "Continue", "primary");
        titleInput.focus();
        return new Promise((resolve) => {
          cancelModal = () => {
            closeModal();
            resolve(null);
          };
          cancel.addEventListener("click", cancelModal);
          proceed.addEventListener("click", () => {
            const title = titleInput.value.trim();
            if (!title) {
              titleInput.focus();
              return;
            }
            closeModal();
            resolve(Object.freeze({ mode: checkbox.checked ? "obsidian" : "download", title }));
          });
        });
      },
      chooseDecision({ title, message, choices }) {
        const panel = openModal(title);
        append(panel, "p", message);
        const actions = append(panel, "div", void 0, "actions");
        return new Promise((resolve) => {
          cancelModal = () => {
            closeModal();
            resolve(choices[0]?.value);
          };
          for (const choice of choices) {
            const button = action(actions, choice.label, choice.primary ? "primary" : choice.danger ? "danger" : "");
            button.addEventListener("click", () => {
              closeModal();
              resolve(choice.value);
            });
          }
        });
      },
      async chooseVaultFolder({ rootHandle, fileSystem, initialSegments = [] }) {
        let current = rootHandle;
        let segments = [];
        try {
          current = await fileSystem.getDirectoryPath(rootHandle, initialSegments);
          segments = [...initialSegments];
        } catch {
          current = rootHandle;
        }
        const panel = openModal("Choose note destination");
        const path = append(panel, "div", void 0, "path");
        const folders = append(panel, "div", void 0, "folders");
        const actions = append(panel, "div", void 0, "actions");
        const cancel = action(actions, "Cancel");
        const back = action(actions, "Back");
        const select = action(actions, "Select this folder", "primary");
        return new Promise((resolve) => {
          cancelModal = () => {
            closeModal();
            resolve(null);
          };
          async function render() {
            path.textContent = "/" + segments.join("/");
            back.disabled = segments.length === 0;
            folders.replaceChildren();
            append(folders, "p", "Loading folders…", "muted");
            try {
              const entries = await fileSystem.listDirectories(current);
              folders.replaceChildren();
              if (entries.length === 0) append(folders, "p", "No subfolders", "muted");
              for (const entry of entries) {
                const button = action(folders, "📁 " + entry.name, "folder");
                button.addEventListener("click", async () => {
                  current = entry.handle;
                  segments.push(entry.name);
                  await render();
                });
              }
            } catch (error) {
              folders.replaceChildren();
              append(folders, "p", "Unable to read this folder: " + error.message, "warning");
            }
          }
          cancel.addEventListener("click", cancelModal);
          back.addEventListener("click", async () => {
            segments.pop();
            current = await fileSystem.getDirectoryPath(rootHandle, segments);
            await render();
          });
          select.addEventListener("click", () => {
            const result = Object.freeze({ handle: current, segments: Object.freeze([...segments]) });
            closeModal();
            resolve(result);
          });
          void render();
        });
      }
    });
  }

  // src/app/capture-workflow.js
  function createCaptureWorkflow({
    globalScope,
    ui,
    fileSystem,
    settingsManager,
    vaultManager,
    obsidianStorage,
    downloadStorage,
    buildSnapshot = buildReadOnlyCaptureSnapshot
  }) {
    let running = false;
    return Object.freeze({
      async run() {
        if (running) return;
        running = true;
        try {
          ui.showBusy("Inspecting the active Instagram item…");
          const [snapshot, settings] = await Promise.all([
            buildSnapshot({ globalScope }),
            settingsManager.getSettings()
          ]);
          const options = await ui.showCaptureOptions({
            captureItem: snapshot.captureItem,
            warnings: snapshot.warnings,
            defaultMode: settings.lastMode
          });
          if (!options) return;
          let result;
          if (options.mode === "download") {
            const parentDirectory = await fileSystem.chooseDirectory({ id: "instagram-download-destination" });
            ui.showBusy("Preparing downloads…");
            result = await downloadStorage.save({
              captureItem: snapshot.captureItem,
              title: options.title,
              parentDirectory,
              onProgress: (event) => ui.showProgress(event)
            });
          } else {
            const vault = await vaultManager.getVault();
            const preflight = await obsidianStorage.preflight({
              vault,
              postId: snapshot.captureItem.postId
            });
            let destination = null;
            if (preflight.kind === "new") {
              const latestSettings = await settingsManager.getSettings();
              const initialSegments = latestSettings.lastNoteRelativePath ? latestSettings.lastNoteRelativePath.split("/").filter(Boolean) : [];
              destination = await ui.chooseVaultFolder({
                rootHandle: vault,
                fileSystem,
                initialSegments
              });
              if (!destination) return;
            }
            ui.showBusy("Preparing Obsidian capture…");
            result = await obsidianStorage.save({
              captureItem: snapshot.captureItem,
              title: options.title,
              vault,
              noteDirectory: destination?.handle,
              noteDirectorySegments: destination?.segments ?? [],
              onProgress: (event) => ui.showProgress(event),
              onNoteCollision: (filename) => ui.chooseDecision({
                title: "Note already exists",
                message: filename + " already exists. Choose how to continue.",
                choices: [
                  { label: "Cancel", value: "cancel" },
                  { label: "Create Copy", value: "copy" },
                  { label: "Replace", value: "replace", danger: true }
                ]
              }),
              onRecovery: () => ui.chooseDecision({
                title: "Interrupted capture found",
                message: "A verified incomplete capture exists. Continuing may replace only deterministic media owned by this Instagram Post ID.",
                choices: [
                  { label: "Cancel", value: "cancel" },
                  { label: "Continue", value: "continue", primary: true }
                ]
              })
            });
            if (destination) {
              await settingsManager.updateSettings({
                lastNoteRelativePath: destination.segments.join("/")
              });
            }
          }
          await settingsManager.updateSettings({ lastMode: options.mode });
          ui.closeModal();
          const warningText = result.warnings.length ? " " + result.warnings.join(" ") : "";
          ui.notify(
            options.mode === "obsidian" ? "Saved Markdown and " + result.files.length + " media file(s)." + warningText : "Downloaded " + result.files.length + " media file(s) to " + result.directoryName + "." + warningText
          );
        } catch (error) {
          ui.closeModal();
          if (error?.name === "AbortError" || error?.code === "CANCELLED") {
            ui.notify("Capture cancelled.");
          } else {
            ui.notify(error?.message ?? "Capture failed.", { error: true, duration: 1e4 });
          }
        } finally {
          running = false;
        }
      }
    });
  }

  // src/app/page-lifecycle.js
  function createPageLifecycle({ globalScope = globalThis, onAvailabilityChange }) {
    let observer;
    let timer;
    let lastKey = null;
    function refresh() {
      clearTimeout(timer);
      timer = globalScope.setTimeout(() => {
        const context = resolveInstagramItemContext({
          locationHref: globalScope.location?.href,
          documentObject: globalScope.document
        });
        const key = context?.canonicalUrl ?? "unsupported";
        if (key !== lastKey) {
          lastKey = key;
          onAvailabilityChange(Boolean(context), context);
        }
      }, 100);
    }
    return Object.freeze({
      start() {
        refresh();
        observer = new globalScope.MutationObserver(refresh);
        observer.observe(globalScope.document.documentElement, { childList: true, subtree: true });
        globalScope.addEventListener("popstate", refresh);
      },
      stop() {
        observer?.disconnect();
        clearTimeout(timer);
        globalScope.removeEventListener("popstate", refresh);
      },
      refresh
    });
  }

  // src/app/bootstrap.js
  function bootstrap({
    globalScope = globalThis,
    gmRequest: gmRequest2,
    gmRegisterMenuCommand: gmRegisterMenuCommand2
  } = {}) {
    const logger = createLogger({ name: APP_CONFIG.name });
    const menu = createTampermonkeyMenuAdapter(gmRegisterMenuCommand2);
    const fileSystem = createFileSystemService({ globalScope });
    const store = globalScope.indexedDB ? createIndexedDbStore({ indexedDB: globalScope.indexedDB }) : createMemoryStore();
    const settingsManager = createSettingsManager(store);
    const vaultManager = createVaultManager({ fileSystem, settingsManager });
    const requestBinary = typeof gmRequest2 === "function" ? createTampermonkeyBinaryRequest(gmRequest2) : async () => {
      throw new Error("Tampermonkey media download API is unavailable.");
    };
    const downloader = createMediaDownloader({ requestBinary });
    const obsidianStorage = createObsidianStorageProvider({ fileSystem, downloader });
    const downloadStorage = createDownloadStorageProvider({ fileSystem, downloader });
    const ui = createAppUi({ documentObject: globalScope.document });
    const workflow = createCaptureWorkflow({
      globalScope,
      ui,
      fileSystem,
      settingsManager,
      vaultManager,
      obsidianStorage,
      downloadStorage
    });
    const pageLifecycle = createPageLifecycle({
      globalScope,
      onAvailabilityChange(available, context) {
        ui.setCaptureAvailable(
          available,
          () => void workflow.run(),
          context?.routeKind === "reel" ? "Save Reel" : "Save Instagram post"
        );
      }
    });
    const controller = new ApplicationController({
      globalScope,
      logger,
      menu,
      gmRequest: gmRequest2,
      workflow,
      ui,
      pageLifecycle,
      vaultManager,
      settingsManager
    });
    controller.initialise();
    return controller;
  }

  // src/index.js
  var gmRequest = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : void 0;
  var gmRegisterMenuCommand = typeof GM_registerMenuCommand === "function" ? GM_registerMenuCommand : void 0;
  bootstrap({
    globalScope: globalThis,
    gmRequest,
    gmRegisterMenuCommand
  });
})();
