import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyMediaProbe,
  collectInstagramMediaProbe,
} from "../src/instagram/media-probe.js";

function mediaElement({
  tagName = "IMG",
  source,
  poster = "",
  alt = "",
  intrinsicWidth = 1080,
  intrinsicHeight = 1350,
  renderedWidth = 540,
  renderedHeight = 675,
  top = 0,
  left = 0,
}) {
  return {
    tagName,
    currentSrc: source,
    src: source,
    naturalWidth: intrinsicWidth,
    naturalHeight: intrinsicHeight,
    videoWidth: intrinsicWidth,
    videoHeight: intrinsicHeight,
    getAttribute(name) {
      return { poster, alt }[name] ?? null;
    },
    getBoundingClientRect() {
      return {
        width: renderedWidth,
        height: renderedHeight,
        top,
        left,
        bottom: top + renderedHeight,
        right: left + renderedWidth,
      };
    },
  };
}

function articleFixture({ media = [], labels = [] } = {}) {
  const region = {
    parentElement: null,
    querySelectorAll(selector) {
      if (selector === "video, img") {
        return media;
      }

      if (selector === "button[aria-label]") {
        return labels.map((label) => ({
          parentElement: region,
          getAttribute() {
            return label;
          },
        }));
      }

      return [];
    },
  };

  return region;
}

function documentFixture(article) {
  return {
    querySelector(selector) {
      return selector === "main article" ? article : null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

test("probe distinguishes substantial post media from a small avatar", () => {
  const article = articleFixture({
    media: [
      mediaElement({
        source: "https://cdn.example/avatar.jpg",
        intrinsicWidth: 150,
        intrinsicHeight: 150,
        renderedWidth: 32,
        renderedHeight: 32,
      }),
      mediaElement({ source: "https://cdn.example/post.jpg" }),
    ],
  });
  const probe = collectInstagramMediaProbe(documentFixture(article));

  assert.equal(probe.articleFound, true);
  assert.equal(probe.candidates.length, 2);
  assert.equal(probe.candidates[0].substantial, false);
  assert.equal(probe.candidates[1].substantial, true);
});

test("semantic navigation controls identify a carousel", () => {
  const probe = collectInstagramMediaProbe(documentFixture(articleFixture({
    media: [mediaElement({ source: "https://cdn.example/slide.jpg" })],
    labels: ["Like", "Next"],
  })));
  const classification = classifyMediaProbe({
    itemRoute: { routeKind: "post" },
    probe,
  });

  assert.deepEqual(probe.carouselControlLabels, ["Next"]);
  assert.equal(classification.contentType, "carousel");
  assert.equal(classification.confidence, "semantic-control");
});

test("one substantial post image classifies as a single image", () => {
  const probe = collectInstagramMediaProbe(documentFixture(articleFixture({
    media: [mediaElement({ source: "https://cdn.example/post.jpg" })],
  })));
  const classification = classifyMediaProbe({
    itemRoute: { routeKind: "post" },
    probe,
  });

  assert.equal(classification.contentType, "image");
  assert.equal(classification.substantialCandidateCount, 1);
});

test("a reel requires a substantial video candidate", () => {
  const videoProbe = collectInstagramMediaProbe(documentFixture(articleFixture({
    media: [mediaElement({
      tagName: "VIDEO",
      source: "https://cdn.example/reel.mp4",
      poster: "https://cdn.example/cover.jpg",
    })],
  })));
  const missingProbe = collectInstagramMediaProbe(documentFixture(articleFixture()));

  assert.equal(classifyMediaProbe({
    itemRoute: { routeKind: "reel" },
    probe: videoProbe,
  }).contentType, "reel");
  assert.equal(classifyMediaProbe({
    itemRoute: { routeKind: "reel" },
    probe: missingProbe,
  }).contentType, "unsupported");
});

test("a missing article produces explicit insufficient evidence", () => {
  const probe = collectInstagramMediaProbe(documentFixture(null));
  const classification = classifyMediaProbe({
    itemRoute: { routeKind: "post" },
    probe,
  });

  assert.equal(probe.articleFound, false);
  assert.equal(probe.regionKind, "document");
  assert.equal(classification.contentType, "unsupported");
  assert.equal(classification.confidence, "insufficient-evidence");
});

test("main-region fallback excludes substantial media outside the viewport", () => {
  const main = articleFixture({
    media: [
      mediaElement({
        source: "https://cdn.example/current.jpg",
        top: 40,
      }),
      mediaElement({
        source: "https://cdn.example/recommendation.jpg",
        top: 1200,
      }),
    ],
  });
  const documentObject = {
    querySelector(selector) {
      return selector === "main" ? main : null;
    },
  };
  const probe = collectInstagramMediaProbe(documentObject, {
    width: 1400,
    height: 900,
  });

  assert.equal(probe.regionKind, "main");
  assert.equal(probe.candidates[0].substantial, true);
  assert.equal(probe.candidates[1].inViewport, false);
  assert.equal(probe.candidates[1].substantial, false);
});

test("carousel control ancestry narrows discovery before main fallback", () => {
  const slide = mediaElement({ source: "https://cdn.example/slide.jpg" });
  const recommendation = mediaElement({
    source: "https://cdn.example/recommendation.jpg",
  });
  const carousel = articleFixture({ media: [slide], labels: ["Next"] });
  const main = {
    querySelectorAll(selector) {
      if (selector === "button[aria-label]") {
        return carousel.querySelectorAll(selector);
      }

      if (selector === "video, img") {
        return [slide, recommendation];
      }

      return [];
    },
  };
  const documentObject = {
    querySelector(selector) {
      return selector === "main" ? main : null;
    },
  };
  const probe = collectInstagramMediaProbe(documentObject);

  assert.equal(probe.regionKind, "carousel-control-ancestor");
  assert.equal(probe.candidates.length, 1);
  assert.equal(probe.candidates[0].sourceFingerprint.length, 8);
  assert.deepEqual(probe.carouselControlLabels, ["Next"]);
});
