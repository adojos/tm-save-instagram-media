import assert from "node:assert/strict";
import test from "node:test";

import { deriveProposedTitle } from "../src/instagram/title.js";

test("title prefers a detected heading", () => {
  assert.equal(
    deriveProposedTitle({
      heading: "  A useful heading  ",
      caption: "Caption text",
      author: "author",
      postId: "ABC123",
    }),
    "A useful heading",
  );
});

test("title uses the first useful caption line without altering caption", () => {
  const caption = "\n  First useful line  \nSecond line";
  assert.equal(
    deriveProposedTitle({ caption, author: "author", postId: "ABC123" }),
    "First useful line",
  );
  assert.equal(caption, "\n  First useful line  \nSecond line");
});

test("title creates the specified deterministic fallback", () => {
  assert.equal(
    deriveProposedTitle({ author: "innovation", postId: "ABC123" }),
    "Instagram - innovation - ABC123",
  );
});

test("title applies a deterministic word-aware length limit", () => {
  assert.equal(
    deriveProposedTitle({
      caption: "A deliberately long caption title",
      postId: "ABC123",
      maxLength: 20,
    }),
    "A deliberately long",
  );
});
