import assert from "node:assert/strict";
import test from "node:test";

import { assembleCaptureSnapshot } from "../src/instagram/capture-snapshot.js";
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
