import assert from "node:assert/strict";
import test from "node:test";

import { extractInstagramMetadata } from "../src/instagram/metadata.js";

const ITEM_ROUTE = Object.freeze({
  routeKind: "post",
  postId: "DTGNAC9E1jI",
  canonicalUrl: "https://www.instagram.com/p/DTGNAC9E1jI/",
});

function element({ text = "", attributes = {} } = {}) {
  return {
    textContent: text,
    getAttribute(name) {
      return attributes[name] ?? null;
    },
  };
}

function documentFixture({ selectors = {}, jsonLd = [] } = {}) {
  return {
    querySelector(selector) {
      return selectors[selector] ?? null;
    },
    querySelectorAll(selector) {
      return selector === 'script[type="application/ld+json"]'
        ? jsonLd.map((value) => element({ text: value }))
        : [];
    },
  };
}

test("semantic page content takes priority over structured fallbacks", () => {
  const documentObject = documentFixture({
    selectors: {
      "article header a[href]": element({
        attributes: { href: "/innovation/" },
      }),
      "article h1": element({ text: "Original caption\nSecond line" }),
    },
    jsonLd: [JSON.stringify({
      "@type": "SocialMediaPosting",
      author: { alternateName: "@fallback" },
      articleBody: "Fallback caption",
      headline: "Structured heading",
    })],
  });

  const metadata = extractInstagramMetadata({ documentObject, itemRoute: ITEM_ROUTE });

  assert.equal(metadata.author, "innovation");
  assert.equal(metadata.caption, "Original caption\nSecond line");
  assert.equal(metadata.proposedTitle, "Structured heading");
  assert.equal(metadata.sources.author, "semantic-profile-link");
  assert.equal(metadata.sources.caption, "semantic-heading");
});

test("active dialog metadata takes priority over a background article", () => {
  const documentObject = documentFixture({
    selectors: {
      '[role="dialog"] header a[href]': element({
        attributes: { href: "/active.author/" },
      }),
      '[role="dialog"] h1': element({ text: "Active reel caption" }),
      "article header a[href]": element({
        attributes: { href: "/background.author/" },
      }),
      "article h1": element({ text: "Background caption" }),
    },
  });

  const metadata = extractInstagramMetadata({ documentObject, itemRoute: ITEM_ROUTE });

  assert.equal(metadata.author, "active.author");
  assert.equal(metadata.caption, "Active reel caption");
  assert.equal(metadata.sources.author, "dialog-profile-link");
  assert.equal(metadata.sources.caption, "dialog-heading");
});

test("JSON-LD supplies metadata when semantic content is unavailable", () => {
  const documentObject = documentFixture({
    jsonLd: ["malformed", JSON.stringify({
      "@graph": [{
        "@type": "SocialMediaPosting",
        author: { alternateName: "@innovation" },
        articleBody: "JSON-LD caption",
      }],
    })],
  });

  const metadata = extractInstagramMetadata({ documentObject, itemRoute: ITEM_ROUTE });

  assert.equal(metadata.author, "innovation");
  assert.equal(metadata.caption, "JSON-LD caption");
  assert.equal(metadata.sources.caption, "json-ld");
});

test("Open Graph is a last-resort Instagram metadata fallback", () => {
  const documentObject = documentFixture({
    selectors: {
      'meta[property="og:description"]': element({
        attributes: {
          content: '20 likes, 2 comments - innovation on August 18, 2026: “Fallback caption”.',
        },
      }),
    },
  });

  const metadata = extractInstagramMetadata({ documentObject, itemRoute: ITEM_ROUTE });

  assert.equal(metadata.author, "innovation");
  assert.equal(metadata.caption, "Fallback caption");
  assert.equal(metadata.sources.author, "open-graph");
});

test("missing optional metadata produces an explicit fallback title", () => {
  const metadata = extractInstagramMetadata({
    documentObject: documentFixture(),
    itemRoute: ITEM_ROUTE,
  });

  assert.equal(metadata.author, "");
  assert.equal(
    metadata.proposedTitle,
    "Instagram - Unknown author - DTGNAC9E1jI",
  );
  assert.equal(metadata.sources.caption, "unavailable");
});
