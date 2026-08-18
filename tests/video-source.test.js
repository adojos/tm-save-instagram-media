import assert from "node:assert/strict";
import test from "node:test";

import { resolveInstagramVideoSource } from "../src/instagram/video-source.js";

function videoElement({ currentSrc = "blob:https://www.instagram.com/temp", src = "", source = "" } = {}) {
  return {
    currentSrc,
    src,
    getAttribute(name) {
      return name === "src" ? src : null;
    },
    querySelectorAll(selector) {
      return selector === "source[src]" && source
        ? [{ src: source, getAttribute: () => source }]
        : [];
    },
  };
}

function documentFixture({ openGraph = "", openGraphUrl = "", scripts = [] } = {}) {
  return {
    querySelector(selector) {
      if (selector === 'meta[property="og:url"]' && openGraphUrl) {
        return { getAttribute: () => openGraphUrl };
      }
      if (selector.includes("og:video") && openGraph) {
        return { getAttribute: () => openGraph };
      }
      return null;
    },
    querySelectorAll(selector) {
      return selector.includes("script[")
        ? scripts.map((value) => ({ textContent: JSON.stringify(value) }))
        : [];
    },
  };
}

test("replaces a blob currentSrc with an HTTPS source child", () => {
  const result = resolveInstagramVideoSource({
    element: videoElement({ source: "https://scontent.cdninstagram.com/reel.mp4" }),
    documentObject: documentFixture(),
    postId: "ABC123",
  });

  assert.equal(result.url, "https://scontent.cdninstagram.com/reel.mp4");
  assert.equal(result.source, "video-element");
  assert.equal(result.temporaryPlaybackDetected, true);
});

test("uses active-page Open Graph video metadata when the element is blob-backed", () => {
  const result = resolveInstagramVideoSource({
    element: videoElement(),
    documentObject: documentFixture({
      openGraph: "https://cdninstagram.com/og-reel.mp4",
      openGraphUrl: "https://www.instagram.com/example/reel/ABC123/",
    }),
    postId: "ABC123",
  });

  assert.equal(result.url, "https://cdninstagram.com/og-reel.mp4");
  assert.equal(result.source, "open-graph");
});

test("uses Post-ID-matched Instagram structured data before unrelated videos", () => {
  const result = resolveInstagramVideoSource({
    element: videoElement(),
    documentObject: documentFixture({ scripts: [{
      items: [
        { code: "OTHER", video_url: "https://cdn.example/other.mp4" },
        { code: "ABC123", video_versions: [{ url: "https://cdn.example/matched.mp4" }] },
      ],
    }] }),
    postId: "ABC123",
  });

  assert.equal(result.url, "https://cdn.example/matched.mp4");
  assert.equal(result.source, "post-structured-data");
});

test("uses a JSON-LD VideoObject as an active-page fallback", () => {
  const result = resolveInstagramVideoSource({
    element: videoElement(),
    documentObject: documentFixture({ scripts: [{
      "@type": "VideoObject",
      identifier: "ABC123",
      contentUrl: "https://cdn.example/video-object.mp4",
    }] }),
    postId: "ABC123",
  });

  assert.equal(result.url, "https://cdn.example/video-object.mp4");
  assert.equal(result.source, "video-structured-data");
});

test("rejects stale Open Graph and generic video data from another SPA item", () => {
  const result = resolveInstagramVideoSource({
    element: videoElement(),
    documentObject: documentFixture({
      openGraph: "https://cdn.example/wrong.mp4",
      openGraphUrl: "https://www.instagram.com/reel/OTHER/",
      scripts: [{
        "@type": "VideoObject",
        identifier: "OTHER",
        contentUrl: "https://cdn.example/also-wrong.mp4",
      }],
    }),
    postId: "ABC123",
  });

  assert.equal(result.url, "");
  assert.equal(result.source, "unavailable");
});

test("does not allow a temporary playback URL to escape source discovery", () => {
  const result = resolveInstagramVideoSource({
    element: videoElement(),
    documentObject: documentFixture(),
    postId: "ABC123",
  });

  assert.equal(result.url, "");
  assert.equal(result.source, "unavailable");
  assert.equal(result.temporaryPlaybackDetected, true);
});
