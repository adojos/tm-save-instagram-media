import { detectInstagramItemRoute } from "./item-route.js";

function attributeValue(element, name) {
  const value = element?.getAttribute?.(name);
  return typeof value === "string" ? value.trim() : "";
}

function routeFromValue(value) {
  try {
    return detectInstagramItemRoute(
      new URL(value, "https://www.instagram.com/"),
    );
  } catch {
    return null;
  }
}

function uniqueRouteFromLinks(elements) {
  const routes = new Map();

  for (const element of elements ?? []) {
    const route = routeFromValue(attributeValue(element, "href"));
    if (route) {
      routes.set(route.canonicalUrl, route);
    }
  }

  return routes.size === 1 ? [...routes.values()][0] : null;
}

function resolved(route, resolutionSource) {
  return route
    ? Object.freeze({ ...route, resolutionSource })
    : null;
}

export function resolveInstagramItemContext({
  locationHref,
  documentObject,
}) {
  const dialogRoute = uniqueRouteFromLinks(
    documentObject?.querySelectorAll?.(
      '[role="dialog"] a[href*="/p/"], [role="dialog"] a[href*="/reel/"]',
    ),
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
    ['meta[property="og:url"]', "content", "open-graph-url"],
  ]) {
    const element = documentObject?.querySelector?.(selector);
    const route = routeFromValue(attributeValue(element, attribute));
    if (route) {
      return resolved(route, source);
    }
  }

  const mainRoute = uniqueRouteFromLinks(
    documentObject?.querySelectorAll?.(
      'main a[href*="/p/"], main a[href*="/reel/"]',
    ),
  );

  return resolved(mainRoute, "unambiguous-main-link");
}
