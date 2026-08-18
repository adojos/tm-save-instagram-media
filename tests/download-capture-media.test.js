import assert from "node:assert/strict";
import test from "node:test";

import { downloadCaptureMedia } from "../src/network/download-capture-media.js";
import { createCaptureItem, createMediaItem } from "../src/model/capture-item.js";

function reelCapture() {
  return createCaptureItem({
    contentType: "reel",
    postId: "ABC123",
    canonicalUrl: "https://www.instagram.com/reel/ABC123/",
    author: "author",
    proposedTitle: "Title",
    capturedAt: "2026-08-18T12:00:00.000Z",
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
  });
}

test("downloads media sequentially and plans deterministic files", async () => {
  const calls = [];
  const progress = [];
  const result = await downloadCaptureMedia({
    captureItem: reelCapture(),
    downloader: {
      async download(media) {
        calls.push(media.url);
        return {
          extension: media.type === "video" ? "mp4" : "jpg",
          blob: new Blob([media.type]),
        };
      },
    },
    onProgress(event) {
      progress.push(event.phase);
    },
  });

  assert.deepEqual(calls, [
    "https://cdn.example/reel.mp4",
    "https://cdn.example/cover.jpg",
  ]);
  assert.deepEqual(result.files.map(({ filename }) => filename), [
    "ABC123.mp4",
    "ABC123-cover.jpg",
  ]);
  assert.deepEqual(progress, ["downloading", "downloading", "complete"]);
});

test("optional cover failure warns and removes it from finalized capture", async () => {
  const result = await downloadCaptureMedia({
    captureItem: reelCapture(),
    downloader: {
      async download(media) {
        if (media.role === "auxiliary") {
          throw new Error("cover failed");
        }
        return { extension: "mp4", blob: new Blob(["video"]) };
      },
    },
  });

  assert.equal(result.captureItem.mediaCount, 1);
  assert.equal(result.captureItem.media.length, 1);
  assert.deepEqual(result.files.map(({ filename }) => filename), [
    "ABC123.mp4",
  ]);
  assert.deepEqual(result.warnings, [
    "Optional cover media could not be downloaded.",
  ]);
});

test("non-JPEG reel cover is omitted without failing the reel", async () => {
  const result = await downloadCaptureMedia({
    captureItem: reelCapture(),
    downloader: {
      async download(media) {
        return media.role === "auxiliary"
          ? { extension: "webp", blob: new Blob(["cover"]) }
          : { extension: "mp4", blob: new Blob(["video"]) };
      },
    },
  });

  assert.deepEqual(result.files.map(({ filename }) => filename), ["ABC123.mp4"]);
  assert.deepEqual(result.warnings, [
    "Optional reel cover was not supplied as a validated JPEG and was omitted.",
  ]);
});

test("required primary failure aborts immediately", async () => {
  let attempts = 0;
  await assert.rejects(
    downloadCaptureMedia({
      captureItem: reelCapture(),
      downloader: {
        async download() {
          attempts += 1;
          throw new Error("primary failed");
        },
      },
    }),
    /primary failed/u,
  );
  assert.equal(attempts, 1);
});
