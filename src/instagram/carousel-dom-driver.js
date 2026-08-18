import {
  fingerprintMediaSource,
  inspectInstagramMediaElement,
  locateInstagramMediaRegion,
} from "./media-probe.js";
import {
  CAROUSEL_CONTROL_LABELS,
  INSTAGRAM_SELECTORS,
} from "./selectors.js";

const MIN_MEDIA_EDGE = 180;
const TRANSITION_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 100;

function controlLabel(button) {
  return button?.getAttribute?.("aria-label")?.trim?.() ?? "";
}

function findControls(region) {
  const buttons = Array.from(
    region.querySelectorAll(INSTAGRAM_SELECTORS.labelledButtons),
  );

  return {
    next: buttons.find((button) =>
      CAROUSEL_CONTROL_LABELS.next.test(controlLabel(button))),
    previous: buttons.find((button) =>
      CAROUSEL_CONTROL_LABELS.previous.test(controlLabel(button))),
  };
}

function intersectRectangle(left, top, right, bottom, rectangle, clipX, clipY) {
  return {
    left: clipX ? Math.max(left, rectangle.left) : left,
    top: clipY ? Math.max(top, rectangle.top) : top,
    right: clipX ? Math.min(right, rectangle.right) : right,
    bottom: clipY ? Math.min(bottom, rectangle.bottom) : bottom,
  };
}

function clippedVisibleArea(element, region, globalScope) {
  const rectangle = element.getBoundingClientRect();
  let bounds = {
    left: Math.max(0, rectangle.left),
    top: Math.max(0, rectangle.top),
    right: Math.min(globalScope.innerWidth, rectangle.right),
    bottom: Math.min(globalScope.innerHeight, rectangle.bottom),
  };
  let ancestor = element.parentElement;

  while (ancestor) {
    const style = globalScope.getComputedStyle?.(ancestor);
    const clipX = style && ["auto", "clip", "hidden", "scroll"].includes(
      style.overflowX,
    );
    const clipY = style && ["auto", "clip", "hidden", "scroll"].includes(
      style.overflowY,
    );

    if (clipX || clipY) {
      bounds = intersectRectangle(
        bounds.left,
        bounds.top,
        bounds.right,
        bounds.bottom,
        ancestor.getBoundingClientRect(),
        clipX,
        clipY,
      );
    }

    if (ancestor === region) {
      break;
    }

    ancestor = ancestor.parentElement;
  }

  return Math.max(0, bounds.right - bounds.left) *
    Math.max(0, bounds.bottom - bounds.top);
}

function normalizedSourceIdentity(source) {
  try {
    const url = new URL(source);
    return url.origin + url.pathname;
  } catch {
    return source;
  }
}

function selectCurrentMedia(region, controls, globalScope, context) {
  const viewport = {
    width: globalScope.innerWidth,
    height: globalScope.innerHeight,
  };
  const candidates = Array.from(
    region.querySelectorAll(INSTAGRAM_SELECTORS.mediaElements),
    (element, index) => ({
      element,
      summary: inspectInstagramMediaElement(element, index, viewport, context),
      area: clippedVisibleArea(element, region, globalScope),
    }),
  ).filter(({ summary }) =>
    summary.source &&
    Math.min(summary.renderedWidth, summary.renderedHeight) >= MIN_MEDIA_EDGE &&
    Math.max(summary.intrinsicWidth, summary.intrinsicHeight) >= MIN_MEDIA_EDGE
  );

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => right.area - left.area);
  const best = candidates[0];
  const runnerUp = candidates[1];

  if (runnerUp && best.area <= runnerUp.area * 1.05) {
    const domOrdered = [...candidates].sort(
      (left, right) => left.summary.index - right.summary.index,
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
      "Multiple carousel media candidates are equally visible; selection is ambiguous.",
    );
  }

  return best;
}

function delay(globalScope, milliseconds) {
  return new Promise((resolve) => {
    globalScope.setTimeout(resolve, milliseconds);
  });
}

export function createInstagramCarouselDriver({
  documentObject,
  globalScope = globalThis,
  itemRoute,
  transitionTimeoutMs = TRANSITION_TIMEOUT_MS,
  pollIntervalMs = POLL_INTERVAL_MS,
}) {
  function read() {
    const located = locateInstagramMediaRegion(documentObject);
    if (!located.element || located.kind !== "carousel-control-ancestor") {
      throw new Error("The active carousel region is unavailable.");
    }

    const controls = findControls(located.element);
    const selected = selectCurrentMedia(located.element, controls, globalScope, {
      documentObject,
      itemRoute,
    });
    if (!selected) {
      throw new Error("No active carousel media could be identified.");
    }

    const { summary } = selected;
    const identity = fingerprintMediaSource(
      normalizedSourceIdentity(summary.source),
    );

    return Object.freeze({
      identity,
      media: Object.freeze({
        type: summary.mediaType,
        url: summary.source,
        width: summary.intrinsicWidth || undefined,
        height: summary.intrinsicHeight || undefined,
      }),
      canPrevious: Boolean(controls.previous),
      canNext: Boolean(controls.next),
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
        // Instagram may temporarily replace the carousel subtree in transition.
      }
    }

    throw new Error(
      "Instagram carousel did not expose a new slide before the timeout.",
    );
  }

  return Object.freeze({
    read,
    previous(previousIdentity) {
      return move("previous", previousIdentity);
    },
    next(previousIdentity) {
      return move("next", previousIdentity);
    },
  });
}
