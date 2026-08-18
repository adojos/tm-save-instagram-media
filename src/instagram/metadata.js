import { deriveProposedTitle } from "./title.js";

const USERNAME_PATTERN = /^[A-Za-z0-9._]+$/u;
const RESERVED_PROFILE_ROUTES = new Set([
  "accounts",
  "direct",
  "explore",
  "p",
  "reel",
  "reels",
  "stories",
]);

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function textFrom(documentObject, selector) {
  return cleanText(documentObject?.querySelector?.(selector)?.textContent);
}

function attributeFrom(documentObject, selector, attribute) {
  return cleanText(
    documentObject?.querySelector?.(selector)?.getAttribute?.(attribute),
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
    "www.instagram.com",
  ].includes(url.hostname.toLowerCase())) {
    return "";
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const username = segments.length === 1 ? segments[0] : "";

  if (
    !USERNAME_PATTERN.test(username) ||
    RESERVED_PROFILE_ROUTES.has(username.toLowerCase())
  ) {
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

  const types = Array.isArray(value["@type"])
    ? value["@type"]
    : [value["@type"]];

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
    'script[type="application/ld+json"]',
  ) ?? [];

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent);
      const posting = findPostingNodes(parsed)[0];

      if (!posting) {
        continue;
      }

      const authorObject = Array.isArray(posting.author)
        ? posting.author[0]
        : posting.author;
      const author = cleanText(
        authorObject?.alternateName ?? authorObject?.name,
      ).replace(/^@/u, "");

      return {
        author,
        caption: cleanText(
          posting.articleBody ?? posting.caption ?? posting.description,
        ),
        heading: cleanText(posting.headline),
      };
    } catch {
      // Ignore malformed or unrelated structured-data blocks.
    }
  }

  return { author: "", caption: "", heading: "" };
}

function readOpenGraphFallback(documentObject) {
  const title = attributeFrom(
    documentObject,
    'meta[property="og:title"]',
    "content",
  );
  const description = attributeFrom(
    documentObject,
    'meta[property="og:description"]',
    "content",
  ) || attributeFrom(
    documentObject,
    'meta[name="description"]',
    "content",
  );

  const titleMatch = title.match(
    /^(.+?)\s+on Instagram:\s*[“"]([\s\S]*?)[”"]\s*$/u,
  );
  const descriptionMatch = description.match(
    /-\s+([A-Za-z0-9._]+)\s+on\s+[^:]+:\s*[“"]([\s\S]*?)[”"]\.?$/u,
  );

  return {
    author: cleanText(titleMatch?.[1] ?? descriptionMatch?.[1]),
    caption: cleanText(titleMatch?.[2] ?? descriptionMatch?.[2]),
  };
}

function chooseValue(candidates) {
  return candidates.find(({ value }) => cleanText(value)) ?? {
    value: "",
    source: "unavailable",
  };
}

export function extractInstagramMetadata({ documentObject, itemRoute }) {
  if (!itemRoute?.postId || !itemRoute?.canonicalUrl) {
    throw new TypeError("A detected Instagram item route is required.");
  }

  const dialogAuthor = usernameFromProfileHref(attributeFrom(
    documentObject,
    '[role="dialog"] header a[href]',
    "href",
  ));
  const articleAuthor = usernameFromProfileHref(
    attributeFrom(documentObject, "article header a[href]", "href"),
  );
  const dialogCaption = textFrom(documentObject, '[role="dialog"] h1');
  const articleCaption = textFrom(documentObject, "article h1");
  const jsonLd = readJsonLd(documentObject);
  const openGraph = readOpenGraphFallback(documentObject);

  const author = chooseValue([
    { value: dialogAuthor, source: "dialog-profile-link" },
    { value: articleAuthor, source: "semantic-profile-link" },
    { value: jsonLd.author, source: "json-ld" },
    { value: openGraph.author, source: "open-graph" },
  ]);
  const caption = chooseValue([
    { value: dialogCaption, source: "dialog-heading" },
    { value: articleCaption, source: "semantic-heading" },
    { value: jsonLd.caption, source: "json-ld" },
    { value: openGraph.caption, source: "open-graph" },
  ]);
  const heading = chooseValue([
    { value: jsonLd.heading, source: "json-ld" },
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
      postId: itemRoute.postId,
    }),
    sources: Object.freeze({
      author: author.source,
      caption: caption.source,
      heading: heading.source,
    }),
  });
}
