import assert from "node:assert/strict";
import test from "node:test";

import {
  CarouselTraversalError,
  traverseCarousel,
} from "../src/instagram/carousel-traversal.js";

function arrayDriver(slides, initialIndex = 0) {
  let index = initialIndex;

  function state() {
    const slide = slides[index];
    return {
      identity: slide.identity,
      media: slide.media,
      canPrevious: index > 0,
      canNext: index < slides.length - 1,
    };
  }

  return {
    read: async () => state(),
    async previous() {
      index -= 1;
      return state();
    },
    async next() {
      index += 1;
      return state();
    },
    get index() {
      return index;
    },
  };
}

const SLIDES = [
  {
    identity: "one",
    media: { type: "image", url: "https://cdn.example/one.jpg" },
  },
  {
    identity: "two",
    media: { type: "video", url: "https://cdn.example/two.mp4" },
  },
  {
    identity: "three",
    media: { type: "image", url: "https://cdn.example/three.jpg" },
  },
];

test("traversal rewinds, preserves mixed-media order, and restores position", async () => {
  const driver = arrayDriver(SLIDES, 1);
  const result = await traverseCarousel({ driver });

  assert.deepEqual(
    result.media.map(({ sequence, type }) => ({ sequence, type })),
    [
      { sequence: 1, type: "image" },
      { sequence: 2, type: "video" },
      { sequence: 3, type: "image" },
    ],
  );
  assert.equal(result.originalPositionRestored, true);
  assert.equal(driver.index, 1);
});

test("traversal detects a repeated slide identity as a loop", async () => {
  const driver = arrayDriver([SLIDES[0], SLIDES[1], SLIDES[0]]);

  await assert.rejects(
    traverseCarousel({ driver, restorePosition: false }),
    (error) =>
      error instanceof CarouselTraversalError &&
      error.code === "FORWARD_LOOP",
  );
});

test("traversal rejects a stalled Next transition", async () => {
  const state = {
    identity: "one",
    media: SLIDES[0].media,
    canPrevious: false,
    canNext: true,
  };
  const driver = {
    read: async () => state,
    previous: async () => state,
    next: async () => state,
  };

  await assert.rejects(
    traverseCarousel({ driver }),
    (error) =>
      error instanceof CarouselTraversalError &&
      error.code === "NEXT_STALLED",
  );
});

test("traversal enforces a maximum slide limit", async () => {
  const driver = arrayDriver(SLIDES);

  await assert.rejects(
    traverseCarousel({ driver, maxSlides: 2 }),
    (error) =>
      error instanceof CarouselTraversalError &&
      error.code === "MAX_SLIDES",
  );
});
