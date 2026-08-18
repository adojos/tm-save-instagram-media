import assert from "node:assert/strict";
import test from "node:test";

import { inspectManagedNote } from "../src/storage/note-target.js";

test("managed recovery notes accept only media owned by the matching Post ID", () => {
  const valid = inspectManagedNote(
    'instagram_id: "ABC123"\n![[media/Instagram/Title - ABC123/ABC123-01.jpg]]\n![[media/Instagram/Title - ABC123/ABC123-cover.jpg]]\n',
    "ABC123",
    "Title - ABC123",
  );

  assert.equal(valid.valid, true);
  assert.deepEqual(valid.mediaFilenames, ["ABC123-01.jpg", "ABC123-cover.jpg"]);

  const unrelated = inspectManagedNote(
    'instagram_id: "ABC123"\n![[media/Instagram/Title - ABC123/OTHER-01.jpg]]\n',
    "ABC123",
    "Title - ABC123",
  );
  assert.equal(unrelated.valid, false);
});

test("managed recovery notes reject a matching directory with unsupported files", () => {
  const inspected = inspectManagedNote(
    'instagram_id: "ABC123"\n![[media/Instagram/Title - ABC123/ABC123-01.exe]]\n',
    "ABC123",
    "Title - ABC123",
  );

  assert.equal(inspected.valid, false);
  assert.equal(inspected.reason, "missing-media-links");
});
