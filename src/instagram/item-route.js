const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
]);

const ROUTE_KINDS = Object.freeze({
  p: "post",
  reel: "reel",
});

const POST_ID_PATTERN = /^[A-Za-z0-9_-]+$/u;

export function detectInstagramItemRoute(urlLike) {
  let url;

  try {
    url = urlLike instanceof URL ? urlLike : new URL(urlLike);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    !INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())
  ) {
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
    canonicalUrl:
      "https://www.instagram.com/" + route + "/" + postId + "/",
  });
}
