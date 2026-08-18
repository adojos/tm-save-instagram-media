import assert from "node:assert/strict";
import test from "node:test";

import {
  assembleCaptureSnapshot,
  buildReadOnlyCaptureSnapshot,
  CaptureInspectionError,
} from "../src/instagram/capture-snapshot.js";
import { createMediaItem } from "../src/model/capture-item.js";

const ROUTE = Object.freeze({
  postId: "ABC123",
  canonicalUrl: "https://www.instagram.com/reel/ABC123/",
  resolutionSource: "active-dialog",
});

const METADATA = Object.freeze({
  author: "innovation",
  caption: "Original caption",
  proposedTitle: "Original caption",
  sources: Object.freeze({ author: "open-graph", caption: "open-graph" }),
});

test("snapshot assembles a reel with cover and primary media_count of one", () => {
  const result = assembleCaptureSnapshot({
    itemRoute: ROUTE,
    metadata: METADATA,
    classification: { contentType: "reel", confidence: "route-and-video" },
    media: [
      createMediaItem({
        sequence: 1,
        type: "video",
        url: "https://cdn.example/reel.mp4",
      }),
      createMediaItem({
        type: "image",
        role: "auxiliary",
        purpose: "cover",
        url: "https://cdn.example/cover.jpg",
      }),
    ],
    capturedAt: "2026-08-18T12:00:00.000Z",
  });

  assert.equal(result.captureItem.contentType, "reel");
  assert.equal(result.captureItem.mediaCount, 1);
  assert.equal(result.captureItem.media.length, 2);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.diagnostics.contextSource, "active-dialog");
});

test("snapshot records non-fatal missing author and reel cover warnings", () => {
  const result = assembleCaptureSnapshot({
    itemRoute: ROUTE,
    metadata: {
      ...METADATA,
      author: "",
      sources: { author: "unavailable", caption: "open-graph" },
    },
    classification: { contentType: "reel", confidence: "route-and-video" },
    media: [createMediaItem({
      sequence: 1,
      type: "video",
      url: "https://cdn.example/reel.mp4",
    })],
    capturedAt: "2026-08-18T12:00:00.000Z",
  });

  assert.equal(result.captureItem.author, "unknown");
  assert.deepEqual(result.warnings, [
    "Instagram author was unavailable; using 'unknown'.",
    "A reliable reel cover was not available.",
  ]);
});

test("blob-only reel playback reports a recovery error before model validation", async () => {
  const video = {
    tagName: "VIDEO",
    currentSrc: "blob:https://www.instagram.com/temporary-playback",
    src: "blob:https://www.instagram.com/temporary-playback",
    videoWidth: 1080,
    videoHeight: 1920,
    getAttribute(name) {
      return name === "src" ? this.src : null;
    },
    getBoundingClientRect() {
      return {
        width: 540,
        height: 760,
        top: 0,
        left: 0,
        right: 540,
        bottom: 760,
      };
    },
    querySelectorAll() {
      return [];
    },
  };
  const article = {
    querySelectorAll(selector) {
      if (selector === "video, img") return [video];
      return [];
    },
  };
  const documentObject = {
    querySelector(selector) {
      return selector === "main article" ? article : null;
    },
    querySelectorAll() {
      return [];
    },
  };

  await assert.rejects(
    buildReadOnlyCaptureSnapshot({
      globalScope: {
        document: documentObject,
        location: { href: "https://www.instagram.com/reel/ABC123/" },
        innerWidth: 1400,
        innerHeight: 900,
      },
    }),
    (error) => {
      assert.ok(error instanceof CaptureInspectionError);
      assert.equal(error.code, "REEL_DOWNLOAD_URL_UNAVAILABLE");
      assert.match(error.message, /temporary reel playback URL/iu);
      assert.doesNotMatch(error.message, /must use HTTP/iu);
      return true;
    },
  );
});
