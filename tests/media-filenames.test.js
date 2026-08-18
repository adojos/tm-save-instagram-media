import assert from "node:assert/strict";
import test from "node:test";

import { createCaptureItem, createMediaItem } from "../src/model/capture-item.js";
import { planMediaFilenames } from "../src/storage/media-filenames.js";

function capture(contentType, media) {
  return createCaptureItem({
    contentType,
    postId: "ABC123",
    canonicalUrl: "https://www.instagram.com/p/ABC123/",
    author: "author",
    proposedTitle: "Title",
    capturedAt: "2026-08-18T12:00:00.000Z",
    media,
  });
}

test("plans zero-padded mixed-carousel filenames from validated formats", () => {
  const item = capture("carousel", [
    createMediaItem({
      sequence: 1,
      type: "image",
      url: "https://cdn.example/one",
    }),
    createMediaItem({
      sequence: 2,
      type: "video",
      url: "https://cdn.example/two",
    }),
  ]);
  const plan = planMediaFilenames({
    captureItem: item,
    downloads: [{ extension: "jpg" }, { extension: "mp4" }],
  });

  assert.deepEqual(plan.map(({ filename }) => filename), [
    "ABC123-01.jpg",
    "ABC123-02.mp4",
  ]);
});

test("plans reel primary and auxiliary cover filenames", () => {
  const item = capture("reel", [
    createMediaItem({
      sequence: 1,
      type: "video",
      url: "https://cdn.example/reel",
    }),
    createMediaItem({
      type: "image",
      role: "auxiliary",
      purpose: "cover",
      url: "https://cdn.example/cover",
    }),
  ]);
  const plan = planMediaFilenames({
    captureItem: item,
    downloads: [{ extension: "mp4" }, { extension: "jpg" }],
  });

  assert.deepEqual(plan.map(({ filename }) => filename), [
    "ABC123.mp4",
    "ABC123-cover.jpg",
  ]);

  assert.throws(() => planMediaFilenames({
    captureItem: item,
    downloads: [{ extension: "mp4" }, { extension: "webp" }],
  }), /validated JPEG/u);
});

test("single-image posts use the deterministic sequence basename", () => {
  const item = capture("image", [createMediaItem({
    sequence: 1,
    type: "image",
    url: "https://cdn.example/image",
  })]);
  const plan = planMediaFilenames({
    captureItem: item,
    downloads: [{ extension: "jpg" }],
  });

  assert.equal(plan[0].filename, "ABC123-01.jpg");
});
