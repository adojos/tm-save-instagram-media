import assert from "node:assert/strict";
import test from "node:test";
import { generateObsidianMarkdown } from "../src/markdown/generator.js";
import { createCaptureItem, createMediaItem } from "../src/model/capture-item.js";

test("Markdown preserves caption and embeds primary and auxiliary media", () => {
  const caption = "Original caption 😀\n#hashtag\n--- still caption";
  const item = createCaptureItem({
    contentType: "reel", postId: "ABC123",
    canonicalUrl: "https://www.instagram.com/reel/ABC123/", author: "creator",
    caption, proposedTitle: "Proposed", capturedAt: "2026-08-18T12:00:00.000Z",
    media: [
      createMediaItem({ sequence: 1, type: "video", url: "https://cdn/x.mp4" }),
      createMediaItem({ type: "image", role: "auxiliary", purpose: "cover", url: "https://cdn/x.jpg" }),
    ],
  });
  const markdown = generateObsidianMarkdown({
    captureItem: item, title: "My\nReel",
    mediaPaths: ["media/Instagram/My Reel - ABC123/ABC123.mp4", "media/Instagram/My Reel - ABC123/ABC123-cover.jpg"],
  });
  assert.match(markdown, /^---\nsource: instagram\n/u);
  assert.match(markdown, /media_count: 1/u);
  assert.match(markdown, /# My Reel/u);
  assert.ok(markdown.includes(caption));
  assert.ok(markdown.includes("![[media/Instagram/My Reel - ABC123/ABC123.mp4]]"));
  assert.ok(markdown.includes("![[media/Instagram/My Reel - ABC123/ABC123-cover.jpg]]"));
});

test("Markdown rejects unsafe or mismatched embed paths", () => {
  const item = createCaptureItem({
    contentType: "image", postId: "ABC123",
    canonicalUrl: "https://www.instagram.com/p/ABC123/", author: "creator",
    proposedTitle: "Title", capturedAt: "2026-08-18T12:00:00.000Z",
    media: [createMediaItem({ sequence: 1, type: "image", url: "https://cdn/x.jpg" })],
  });
  assert.throws(() => generateObsidianMarkdown({ captureItem: item, title: "Title", mediaPaths: [] }));
  assert.throws(() => generateObsidianMarkdown({ captureItem: item, title: "Title", mediaPaths: ["unsafe]]path"] }));
});
