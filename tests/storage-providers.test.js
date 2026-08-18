import assert from "node:assert/strict";
import test from "node:test";
import { createCaptureItem, createMediaItem } from "../src/model/capture-item.js";
import { createDownloadStorageProvider } from "../src/storage/download-storage.js";
import { createObsidianStorageProvider } from "../src/storage/obsidian-storage.js";
import { COMPLETE_MARKER, INCOMPLETE_MARKER } from "../src/storage/capture-state.js";
import { createFakeFileSystem } from "./helpers/fake-file-system.js";

function imageCapture() {
  return createCaptureItem({
    contentType: "image", postId: "ABC123",
    canonicalUrl: "https://www.instagram.com/p/ABC123/", author: "creator",
    caption: "Original", proposedTitle: "Title", capturedAt: "2026-08-18T12:00:00.000Z",
    media: [createMediaItem({ sequence: 1, type: "image", url: "https://cdn/image" })],
  });
}

function successfulDownloader() {
  return { async download() { return { extension: "jpg", blob: new Blob(["image"]) }; } };
}

test("Mode B creates numbered per-item directories and media only", async () => {
  const { fileSystem, root } = createFakeFileSystem();
  const provider = createDownloadStorageProvider({ fileSystem, downloader: successfulDownloader() });
  const first = await provider.save({ captureItem: imageCapture(), title: "Title", parentDirectory: root });
  const second = await provider.save({ captureItem: imageCapture(), title: "Title", parentDirectory: root });

  assert.equal(first.directoryName, "Title - ABC123");
  assert.equal(second.directoryName, "Title - ABC123 - 2");
  assert.equal(await fileSystem.fileExists(root.directories.get(first.directoryName), "ABC123-01.jpg"), true);
  assert.equal(root.directories.get(first.directoryName).files.size, 1);
});

test("Mode A writes marker, media, Markdown, complete marker, then cleans up", async () => {
  const { fileSystem, root } = createFakeFileSystem();
  const notes = await fileSystem.getDirectory(root, "Notes", { create: true });
  const provider = createObsidianStorageProvider({
    fileSystem, downloader: successfulDownloader(), now: () => "2026-08-18T12:00:00.000Z",
  });
  const result = await provider.save({
    captureItem: imageCapture(), title: "Title", vault: root,
    noteDirectory: notes, noteDirectorySegments: ["Notes"],
    onNoteCollision: async () => "cancel", onRecovery: async () => "cancel",
  });

  assert.equal(result.notePath, "Notes/Title.md");
  assert.match(await fileSystem.readText(notes, "Title.md"), /instagram_id: "ABC123"/u);
  const instagram = await fileSystem.getDirectoryPath(root, ["media", "Instagram"]);
  const post = await fileSystem.getDirectory(instagram, "Title - ABC123");
  assert.equal(await fileSystem.fileExists(post, "ABC123-01.jpg"), true);
  assert.equal(await fileSystem.fileExists(post, COMPLETE_MARKER), true);
  assert.equal(await fileSystem.fileExists(post, INCOMPLETE_MARKER), false);

  await assert.rejects(provider.save({
    captureItem: imageCapture(), title: "Renamed", vault: root,
    noteDirectory: notes, noteDirectorySegments: ["Notes"],
  }), (error) => error.code === "DUPLICATE_CAPTURE");
});

test("Mode A recovers only after matching incomplete marker and confirmation", async () => {
  const { fileSystem, root } = createFakeFileSystem();
  const notes = await fileSystem.getDirectory(root, "Notes", { create: true });
  const failing = createObsidianStorageProvider({
    fileSystem,
    downloader: { async download() { throw new Error("interrupted"); } },
    now: () => "2026-08-18T12:00:00.000Z",
  });
  await assert.rejects(failing.save({
    captureItem: imageCapture(), title: "Title", vault: root,
    noteDirectory: notes, noteDirectorySegments: ["Notes"],
  }), /interrupted/u);

  const instagram = await fileSystem.getDirectoryPath(root, ["media", "Instagram"]);
  const post = await fileSystem.getDirectory(instagram, "Title - ABC123");
  assert.equal(await fileSystem.fileExists(post, INCOMPLETE_MARKER), true);

  const recovered = createObsidianStorageProvider({
    fileSystem, downloader: successfulDownloader(), now: () => "2026-08-18T12:01:00.000Z",
  });
  const result = await recovered.save({
    captureItem: imageCapture(), title: "Title", vault: root,
    onRecovery: async () => "continue",
  });
  assert.equal(result.notePath, "Notes/Title.md");
  assert.equal(await fileSystem.fileExists(post, COMPLETE_MARKER), true);
});

test("Mode A refuses an existing untracked managed directory", async () => {
  const { fileSystem, root } = createFakeFileSystem();
  const mediaRoot = await fileSystem.getDirectoryPath(root, ["media", "Instagram"], { create: true });
  await fileSystem.getDirectory(mediaRoot, "Title - ABC123", { create: true });
  const notes = await fileSystem.getDirectory(root, "Notes", { create: true });
  const provider = createObsidianStorageProvider({ fileSystem, downloader: successfulDownloader() });

  await assert.rejects(provider.save({
    captureItem: imageCapture(), title: "Title", vault: root,
    noteDirectory: notes, noteDirectorySegments: ["Notes"],
  }), (error) => error.code === "CAPTURE_STATE_CONFLICT");
});
