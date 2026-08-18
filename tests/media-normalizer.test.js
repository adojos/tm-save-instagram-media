import assert from "node:assert/strict";
import test from "node:test";

import { normalizeNonCarouselMedia } from "../src/instagram/media-normalizer.js";

function candidate({
  index,
  mediaType,
  source,
  poster = "",
  intrinsicWidth = 1080,
  intrinsicHeight = 1350,
}) {
  return {
    index,
    mediaType,
    source,
    poster,
    intrinsicWidth,
    intrinsicHeight,
  };
}

test("normalizes the selected single image as one primary item", () => {
  const media = normalizeNonCarouselMedia({
    probe: {
      candidates: [
        candidate({
          index: 1,
          mediaType: "image",
          source: "https://cdn.example/post.jpg",
        }),
        candidate({
          index: 2,
          mediaType: "image",
          source: "https://cdn.example/recommendation.jpg",
        }),
      ],
    },
    classification: {
      contentType: "image",
      selectedCandidateIndex: 1,
    },
  });

  assert.equal(media.length, 1);
  assert.equal(media[0].role, "primary");
  assert.equal(media[0].sequence, 1);
  assert.equal(media[0].url, "https://cdn.example/post.jpg");
});

test("normalizes a reel video and optional poster cover", () => {
  const media = normalizeNonCarouselMedia({
    probe: {
      candidates: [candidate({
        index: 3,
        mediaType: "video",
        source: "https://cdn.example/reel.mp4",
        poster: "https://cdn.example/cover.jpg",
        intrinsicWidth: 1080,
        intrinsicHeight: 1920,
      })],
    },
    classification: {
      contentType: "reel",
      selectedCandidateIndex: 3,
    },
  });

  assert.equal(media.length, 2);
  assert.deepEqual(
    media.map(({ type, role, purpose }) => ({ type, role, purpose })),
    [
      { type: "video", role: "primary", purpose: null },
      { type: "image", role: "auxiliary", purpose: "cover" },
    ],
  );
});

test("missing or invalid reel posters do not fail primary media", () => {
  const media = normalizeNonCarouselMedia({
    probe: {
      candidates: [candidate({
        index: 1,
        mediaType: "video",
        source: "https://cdn.example/reel.mp4",
        poster: "data:image/jpeg;base64,not-used",
      })],
    },
    classification: {
      contentType: "reel",
      selectedCandidateIndex: 1,
    },
  });

  assert.equal(media.length, 1);
  assert.equal(media[0].type, "video");
});

test("normalization rejects a missing selected candidate", () => {
  assert.throws(
    () => normalizeNonCarouselMedia({
      probe: { candidates: [] },
      classification: {
        contentType: "image",
        selectedCandidateIndex: 1,
      },
    }),
    /selected image media candidate is unavailable/u,
  );
});
