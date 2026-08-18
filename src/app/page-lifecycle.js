import { resolveInstagramItemContext } from "../instagram/item-context.js";

export function createPageLifecycle({ globalScope = globalThis, onAvailabilityChange }) {
  let observer;
  let timer;
  let lastKey = null;

  function refresh() {
    clearTimeout(timer);
    timer = globalScope.setTimeout(() => {
      const context = resolveInstagramItemContext({
        locationHref: globalScope.location?.href,
        documentObject: globalScope.document,
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
    refresh,
  });
}
