import assert from "node:assert/strict";
import test from "node:test";

import { detectInstagramItemRoute } from "../src/instagram/item-route.js";

test("detects a post permalink and canonical Post ID", () => {
  assert.deepEqual(
    detectInstagramItemRoute(
      "https://www.instagram.com/p/DTGNAC9E1jI/?img_index=3#fragment",
    ),
    {
      routeKind: "post",
      postId: "DTGNAC9E1jI",
      canonicalUrl: "https://www.instagram.com/p/DTGNAC9E1jI/",
    },
  );
});

test("detects a reel permalink", () => {
  assert.deepEqual(
    detectInstagramItemRoute(
      new URL("https://instagram.com/reel/ABC_123-xy/"),
    ),
    {
      routeKind: "reel",
      postId: "ABC_123-xy",
      canonicalUrl: "https://www.instagram.com/reel/ABC_123-xy/",
    },
  );
});

test("rejects unsupported Instagram routes", () => {
  assert.equal(
    detectInstagramItemRoute("https://www.instagram.com/stories/example/123/"),
    null,
  );
  assert.equal(
    detectInstagramItemRoute("https://www.instagram.com/explore/"),
    null,
  );
});

test("rejects lookalike hosts and insecure URLs", () => {
  assert.equal(
    detectInstagramItemRoute("https://www.instagram.com.example/p/ABC123/"),
    null,
  );
  assert.equal(
    detectInstagramItemRoute("http://www.instagram.com/p/ABC123/"),
    null,
  );
});

test("rejects malformed or ambiguous item paths", () => {
  assert.equal(
    detectInstagramItemRoute("https://www.instagram.com/p/ABC%2F123/"),
    null,
  );
  assert.equal(
    detectInstagramItemRoute("https://www.instagram.com/p/ABC123/embed/"),
    null,
  );
  assert.equal(detectInstagramItemRoute("not a URL"), null);
});
