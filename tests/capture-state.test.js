import assert from "node:assert/strict";
import test from "node:test";
import { COMPLETE_MARKER, createCompleteMarker, createIncompleteMarker, findManagedCaptureDirectory, INCOMPLETE_MARKER, inspectCaptureState } from "../src/storage/capture-state.js";

function markerFileSystem(files = {}) {
  return {
    async fileExists(_directory, name) { return Object.hasOwn(files, name); },
    async readText(_directory, name) { return files[name]; },
  };
}

const incomplete = createIncompleteMarker({ postId: "ABC123", notePath: "AI/Title.md", startedAt: "2026-08-18T12:00:00.000Z" });
const complete = createCompleteMarker({ postId: "ABC123", notePath: "AI/Title.md", mediaFilenames: ["ABC123-01.jpg"], completedAt: "2026-08-18T12:01:00.000Z" });

test("complete marker is authoritative when both markers exist", async () => {
  const state = await inspectCaptureState({ fileSystem: markerFileSystem({ [COMPLETE_MARKER]: JSON.stringify(complete), [INCOMPLETE_MARKER]: JSON.stringify(incomplete) }), directory: {}, postId: "ABC123" });
  assert.equal(state.kind, "complete");
  assert.equal(state.staleIncomplete, true);
});

test("matching incomplete marker permits recovery classification", async () => {
  const state = await inspectCaptureState({ fileSystem: markerFileSystem({ [INCOMPLETE_MARKER]: JSON.stringify(incomplete) }), directory: {}, postId: "ABC123" });
  assert.equal(state.kind, "incomplete");
  assert.equal(state.marker.notePath, "AI/Title.md");
});

test("malformed and identity-mismatched markers stop automatically", async () => {
  assert.equal((await inspectCaptureState({ fileSystem: markerFileSystem({ [INCOMPLETE_MARKER]: "{" }), directory: {}, postId: "ABC123" })).kind, "conflict");
  assert.equal((await inspectCaptureState({ fileSystem: markerFileSystem({ [INCOMPLETE_MARKER]: JSON.stringify({ ...incomplete, postId: "OTHER" }) }), directory: {}, postId: "ABC123" })).kind, "conflict");
});

test("directory without markers remains untracked", async () => {
  assert.equal((await inspectCaptureState({ fileSystem: markerFileSystem(), directory: {}, postId: "ABC123" })).kind, "untracked");
});

test("managed directory lookup uses Post-ID suffix and rejects ambiguity", async () => {
  const fileSystem = { async listDirectories() { return [{ name: "Old title - ABC123", handle: { id: 1 } }, { name: "Other - XYZ999", handle: { id: 2 } }]; } };
  assert.equal((await findManagedCaptureDirectory({ fileSystem, mediaRoot: {}, postId: "ABC123" })).handle.id, 1);
  await assert.rejects(findManagedCaptureDirectory({ fileSystem: { async listDirectories() { return [{ name: "One - ABC123", handle: {} }, { name: "Two - ABC123", handle: {} }]; } }, mediaRoot: {}, postId: "ABC123" }), (error) => error.code === "AMBIGUOUS_CAPTURE_DIRECTORIES");
});
