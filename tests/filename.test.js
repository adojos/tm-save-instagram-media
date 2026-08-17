import assert from "node:assert/strict";
import test from "node:test";

import {
  buildItemDirectoryName,
  buildNoteFilename,
  sanitizePathComponent,
} from "../src/utils/filename.js";

test("sanitizePathComponent replaces filesystem and wikilink controls", () => {
  const actual = sanitizePathComponent(
    '  Elite <Roadmap> #1 ^ [Draft] | "Test"?  ',
  );

  assert.doesNotMatch(actual, /[<>:"/\\|?*#\^\[\]]/u);
  assert.doesNotMatch(actual, /[. ]$/u);
  assert.match(actual, /Elite/u);
  assert.match(actual, /Roadmap/u);
});

test("sanitizePathComponent handles empty and reserved names", () => {
  assert.equal(sanitizePathComponent("  ...  "), "Instagram");
  assert.equal(
    sanitizePathComponent("", { fallback: "Bad#Fallback" }),
    "Bad - Fallback",
  );
  assert.equal(sanitizePathComponent("CON"), "CON-item");
  assert.equal(sanitizePathComponent("lpt1.txt"), "lpt1.txt-item");
});

test("sanitizePathComponent applies a deterministic length limit", () => {
  const actual = sanitizePathComponent("A".repeat(200), {
    maxLength: 40,
  });

  assert.equal(actual.length, 40);
});

test("buildItemDirectoryName preserves identity and collision suffix", () => {
  const actual = buildItemDirectoryName(
    "A title that is intentionally much too long",
    "DTGNAC9E1jI",
    {
      collisionNumber: 3,
      maxLength: 32,
    },
  );

  assert.equal(actual.length, 32);
  assert.match(actual, / - DTGNAC9E1jI - 3$/u);
});

test("buildItemDirectoryName rejects invalid canonical IDs", () => {
  assert.throws(
    () => buildItemDirectoryName("Title", "../post"),
    /canonical Instagram ID/u,
  );
});

test("buildNoteFilename adds one Markdown extension", () => {
  assert.equal(buildNoteFilename("Roadmap?.md"), "Roadmap.md");
});
