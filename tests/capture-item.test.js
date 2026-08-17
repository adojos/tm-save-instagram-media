import assert from "node:assert/strict";
import test from "node:test";

import {
  countPrimaryMedia,
  createCaptureItem,
  createMediaItem,
} from "../src/model/capture-item.js";

function media(overrides = {}) {
  return createMediaItem({
    sequence: 1,
    type: "image",
    role: "primary",
    url: "https://scontent.cdninstagram.com/image.jpg",
    ...overrides,
  });
}

test("mixed carousels preserve typed primary sequence", () => {
  const capture = createCaptureItem({
    contentType: "carousel",
    postId: "DTGNAC9E1jI",
    canonicalUrl: "https://www.instagram.com/p/DTGNAC9E1jI/",
    author: "innovation",
    caption: "Original caption 🚀",
    proposedTitle: "Elite Mastery Roadmap",
    capturedAt: "2026-08-17T20:00:00+01:00",
    media: [
      media(),
      media({
        sequence: 2,
        type: "video",
        url: "https://scontent.cdninstagram.com/video.mp4",
      }),
    ],
  });

  assert.equal(capture.mediaCount, 2);
  assert.equal(capture.caption, "Original caption 🚀");
  assert.deepEqual(
    capture.media.map(({ sequence, type }) => ({ sequence, type })),
    [
      { sequence: 1, type: "image" },
      { sequence: 2, type: "video" },
    ],
  );
  assert.ok(Object.isFrozen(capture));
  assert.ok(Object.isFrozen(capture.media));
});

test("auxiliary reel covers do not increment mediaCount", () => {
  const reelVideo = media({
    type: "video",
    url: "https://scontent.cdninstagram.com/reel.mp4",
  });
  const cover = media({
    sequence: undefined,
    role: "auxiliary",
    purpose: "cover",
  });

  const capture = createCaptureItem({
    contentType: "reel",
    postId: "ABC123",
    canonicalUrl: "https://www.instagram.com/reel/ABC123/",
    author: "creator",
    proposedTitle: "Example Reel",
    capturedAt: "2026-08-17T20:00:00Z",
    media: [reelVideo, cover],
  });

  assert.equal(capture.mediaCount, 1);
  assert.equal(countPrimaryMedia(capture.media), 1);
});

test("primary sequences must be contiguous", () => {
  assert.throws(
    () =>
      createCaptureItem({
        contentType: "carousel",
        postId: "ABC123",
        canonicalUrl: "https://www.instagram.com/p/ABC123/",
        author: "creator",
        proposedTitle: "Broken sequence",
        capturedAt: "2026-08-17T20:00:00Z",
        media: [media({ sequence: 2 })],
      }),
    /sequence must start at 1/u,
  );
});

test("single-image and reel invariants are enforced", () => {
  const video = media({
    type: "video",
    url: "https://scontent.cdninstagram.com/video.mp4",
  });

  assert.throws(
    () =>
      createCaptureItem({
        contentType: "image",
        postId: "ABC123",
        canonicalUrl: "https://www.instagram.com/p/ABC123/",
        author: "creator",
        proposedTitle: "Not an image",
        capturedAt: "2026-08-17T20:00:00Z",
        media: [video],
      }),
    /exactly one primary image/u,
  );
});

test("capture identity rejects path-like Post IDs", () => {
  assert.throws(
    () =>
      createCaptureItem({
        contentType: "image",
        postId: "../ABC123",
        canonicalUrl: "https://www.instagram.com/p/ABC123/",
        author: "creator",
        proposedTitle: "Invalid identity",
        capturedAt: "2026-08-17T20:00:00Z",
        media: [media()],
      }),
    /canonical Instagram ID/u,
  );
});
