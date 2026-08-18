const MAX_STRUCTURED_SCRIPT_LENGTH = 5_000_000;
const MAX_VISITED_NODES = 50_000;

export function isHttpMediaUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    return ["http:", "https:"].includes(new URL(value.trim()).protocol);
  } catch {
    return false;
  }
}

function firstHttpUrl(values) {
  return values.find(isHttpMediaUrl)?.trim() ?? "";
}

function attribute(element, name) {
  const value = element?.getAttribute?.(name);
  return typeof value === "string" ? value.trim() : "";
}

function directElementSource(element) {
  const childSources = Array.from(
    element?.querySelectorAll?.("source[src]") ?? [],
    (source) => source?.src || attribute(source, "src"),
  );
  return firstHttpUrl([
    element?.currentSrc,
    element?.src,
    attribute(element, "src"),
    attribute(element, "data-src"),
    attribute(element, "data-video-url"),
    ...childSources,
  ]);
}

function urlReferencesPost(value, postId) {
  if (!postId || typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if (!/(?:^|\.)instagram\.com$/iu.test(url.hostname)) return false;
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.some((segment, index) =>
      ["p", "reel", "reels"].includes(segment.toLowerCase()) &&
      segments[index + 1] === postId
    );
  } catch {
    return false;
  }
}

function openGraphBelongsToPost(documentObject, postId) {
  if (!postId) return true;
  const pageUrl = attribute(
    documentObject?.querySelector?.('meta[property="og:url"]'),
    "content",
  );
  return urlReferencesPost(pageUrl, postId);
}

function openGraphSource(documentObject, postId) {
  if (!openGraphBelongsToPost(documentObject, postId)) return "";
  return firstHttpUrl([
    attribute(documentObject?.querySelector?.('meta[property="og:video:secure_url"]'), "content"),
    attribute(documentObject?.querySelector?.('meta[property="og:video:url"]'), "content"),
    attribute(documentObject?.querySelector?.('meta[property="og:video"]'), "content"),
  ]);
}

function parseStructuredScripts(documentObject) {
  const scripts = documentObject?.querySelectorAll?.(
    'script[type="application/json"], script[type="application/ld+json"]',
  ) ?? [];
  const parsed = [];
  for (const script of scripts) {
    const text = typeof script?.textContent === "string"
      ? script.textContent.trim()
      : "";
    if (!text || text.length > MAX_STRUCTURED_SCRIPT_LENGTH) continue;
    try {
      parsed.push(JSON.parse(text));
    } catch {
      // Ignore malformed or non-JSON state blocks.
    }
  }
  return parsed;
}

function objectReferencesPost(value, postId) {
  if (!postId || !value || typeof value !== "object") return false;
  if (
    value.code === postId ||
    value.shortcode === postId ||
    value.identifier === postId
  ) {
    return true;
  }
  return [value.url, value["@id"], value.embedUrl]
    .some((candidate) => urlReferencesPost(candidate, postId));
}

function findVideoObjectUrl(value, postId, pageMatchesPost) {
  let visited = 0;
  const stack = [value];
  while (stack.length && visited < MAX_VISITED_NODES) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    visited += 1;
    if (
      (current["@type"] === "VideoObject" || current.__typename === "Video") &&
      (pageMatchesPost || objectReferencesPost(current, postId)) &&
      isHttpMediaUrl(current.contentUrl ?? current.video_url ?? current.url)
    ) {
      return current.contentUrl ?? current.video_url ?? current.url;
    }
    for (const child of Array.isArray(current) ? current : Object.values(current)) {
      stack.push(child);
    }
  }
  return "";
}

function matchingPostVideoUrl(value, postId) {
  if (!postId) return "";
  let visited = 0;
  const stack = [value];
  while (stack.length && visited < MAX_VISITED_NODES) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    visited += 1;
    if (current.code === postId || current.shortcode === postId) {
      const versions = Array.isArray(current.video_versions)
        ? current.video_versions.map((version) => version?.url)
        : [];
      const found = firstHttpUrl([
        current.video_url,
        current.videoUrl,
        current.contentUrl,
        ...versions,
      ]);
      if (found) return found;
    }
    for (const child of Array.isArray(current) ? current : Object.values(current)) {
      stack.push(child);
    }
  }
  return "";
}

function structuredSource(documentObject, postId) {
  const values = parseStructuredScripts(documentObject);
  for (const value of values) {
    const matched = matchingPostVideoUrl(value, postId);
    if (matched) return { url: matched, source: "post-structured-data" };
  }
  const pageMatchesPost = openGraphBelongsToPost(documentObject, postId);
  for (const value of values) {
    const videoObject = findVideoObjectUrl(value, postId, pageMatchesPost);
    if (videoObject) return { url: videoObject, source: "video-structured-data" };
  }
  return { url: "", source: "unavailable" };
}

export function resolveInstagramVideoSource({ element, documentObject, postId }) {
  const temporaryPlaybackDetected = [
    element?.currentSrc,
    element?.src,
    attribute(element, "src"),
  ].some((value) => typeof value === "string" && /^(?:blob|data):/iu.test(value));

  const direct = directElementSource(element);
  if (direct) {
    return Object.freeze({ url: direct, source: "video-element", temporaryPlaybackDetected });
  }
  const openGraph = openGraphSource(documentObject, postId);
  if (openGraph) {
    return Object.freeze({ url: openGraph, source: "open-graph", temporaryPlaybackDetected });
  }
  const structured = structuredSource(documentObject, postId);
  return Object.freeze({ ...structured, temporaryPlaybackDetected });
}
