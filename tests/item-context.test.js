import assert from "node:assert/strict";
import test from "node:test";

import { resolveInstagramItemContext } from "../src/instagram/item-context.js";

function element(attributes) {
  return {
    getAttribute(name) {
      return attributes[name] ?? null;
    },
  };
}

function documentFixture({ one = {}, all = {} } = {}) {
  return {
    querySelector(selector) {
      return one[selector] ?? null;
    },
    querySelectorAll(selector) {
      return all[selector] ?? [];
    },
  };
}

const DIALOG_SELECTOR =
  '[role="dialog"] a[href*="/p/"], [role="dialog"] a[href*="/reel/"]';
const MAIN_SELECTOR = 'main a[href*="/p/"], main a[href*="/reel/"]';

test("an active item dialog takes priority over its background location", () => {
  const result = resolveInstagramItemContext({
    locationHref: "https://www.instagram.com/p/LOCATION1/",
    documentObject: documentFixture({
      all: {
        [DIALOG_SELECTOR]: [element({
          href: "https://www.instagram.com/reel/DIALOG1/",
        })],
      },
    }),
  });

  assert.equal(result.postId, "DIALOG1");
  assert.equal(result.resolutionSource, "active-dialog");
});

test("location permalink resolves when no active item dialog exists", () => {
  const result = resolveInstagramItemContext({
    locationHref: "https://www.instagram.com/p/LOCATION1/",
    documentObject: documentFixture(),
  });

  assert.equal(result.postId, "LOCATION1");
  assert.equal(result.resolutionSource, "location");
});

test("active dialog resolves a reel opened over an unsupported route", () => {
  const result = resolveInstagramItemContext({
    locationHref: "https://www.instagram.com/reels/",
    documentObject: documentFixture({
      all: {
        [DIALOG_SELECTOR]: [
          element({ href: "https://www.instagram.com/reel/REEL123/" }),
          element({ href: "/reel/REEL123/" }),
        ],
      },
    }),
  });

  assert.equal(result.routeKind, "reel");
  assert.equal(result.postId, "REEL123");
  assert.equal(result.resolutionSource, "active-dialog");
});

test("structured canonical metadata is a safe fallback", () => {
  const result = resolveInstagramItemContext({
    locationHref: "https://www.instagram.com/reels/",
    documentObject: documentFixture({
      one: {
        'link[rel="canonical"]': element({
          href: "https://www.instagram.com/reel/CANONICAL1/",
        }),
      },
    }),
  });

  assert.equal(result.postId, "CANONICAL1");
  assert.equal(result.resolutionSource, "canonical-link");
});

test("multiple different dialog items remain ambiguous", () => {
  const result = resolveInstagramItemContext({
    locationHref: "https://www.instagram.com/reels/",
    documentObject: documentFixture({
      all: {
        [DIALOG_SELECTOR]: [
          element({ href: "https://www.instagram.com/reel/ONE123/" }),
          element({ href: "https://www.instagram.com/reel/TWO123/" }),
        ],
        [MAIN_SELECTOR]: [
          element({ href: "https://www.instagram.com/reel/ONE123/" }),
          element({ href: "https://www.instagram.com/reel/TWO123/" }),
        ],
      },
    }),
  });

  assert.equal(result, null);
});

test("one unique main permalink resolves after stronger sources fail", () => {
  const result = resolveInstagramItemContext({
    locationHref: "https://www.instagram.com/reels/",
    documentObject: documentFixture({
      all: {
        [MAIN_SELECTOR]: [
          element({ href: "/reel/ONLY123/" }),
          element({ href: "/reel/ONLY123/?utm_source=test" }),
        ],
      },
    }),
  });

  assert.equal(result.postId, "ONLY123");
  assert.equal(result.resolutionSource, "unambiguous-main-link");
});
