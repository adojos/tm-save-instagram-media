import assert from "node:assert/strict";
import test from "node:test";

import { createMediaRootManager } from "../src/filesystem/media-root-manager.js";
import { createMemoryStore } from "../src/settings/indexeddb-store.js";
import { createSettingsManager } from "../src/settings/settings-manager.js";
import { createFakeFileSystem } from "./helpers/fake-file-system.js";

function harness() {
  const { fileSystem, root } = createFakeFileSystem();
  const settingsManager = createSettingsManager(createMemoryStore());
  const manager = createMediaRootManager({ fileSystem, settingsManager });
  return { fileSystem, root, settingsManager, manager };
}

test("reuses a first-level Media directory case-insensitively and preserves casing", async () => {
  const { fileSystem, root, settingsManager, manager } = harness();
  await fileSystem.getDirectory(root, "MEDIA", { create: true });

  const location = await manager.resolve({
    vault: root,
    chooseLocation: async () => { throw new Error("prompt should not run"); },
  });

  assert.deepEqual(location.segments, ["MEDIA", "Instagram"]);
  assert.equal((await settingsManager.getSettings()).instagramMediaPath, "MEDIA/Instagram");
});

test("creates Media at the vault root when the user chooses the default", async () => {
  const { root, settingsManager, manager } = harness();
  const location = await manager.resolve({
    vault: root,
    chooseLocation: async () => ({ kind: "root" }),
  });

  assert.deepEqual(location.segments, ["Media", "Instagram"]);
  assert.equal((await settingsManager.getSettings()).instagramMediaPath, "Media/Instagram");
});

test("creates and persists Media beneath a custom vault-relative parent", async () => {
  const { fileSystem, root, settingsManager, manager } = harness();
  const attachments = await fileSystem.getDirectory(root, "Attachments", { create: true });
  const first = await manager.resolve({
    vault: root,
    chooseLocation: async () => ({
      kind: "custom",
      handle: attachments,
      segments: ["Attachments"],
    }),
  });
  assert.deepEqual(first.segments, ["Attachments", "Media", "Instagram"]);

  const second = await manager.resolve({
    vault: root,
    chooseLocation: async () => { throw new Error("persisted path should be reused"); },
  });
  assert.equal(second.handle, first.handle);
  assert.equal((await settingsManager.getSettings()).instagramMediaPath, "Attachments/Media/Instagram");
});

test("uses a custom selected Media directory directly instead of nesting another", async () => {
  const { fileSystem, root, manager } = harness();
  const assets = await fileSystem.getDirectory(root, "Assets", { create: true });
  const media = await fileSystem.getDirectory(assets, "media", { create: true });
  const location = await manager.resolve({
    vault: root,
    chooseLocation: async () => ({
      kind: "custom",
      handle: media,
      segments: ["Assets", "media"],
    }),
  });

  assert.deepEqual(location.segments, ["Assets", "media", "Instagram"]);
  assert.equal(media.directories.has("Media"), false);
});

test("a missing persisted location falls back to first-level discovery", async () => {
  const { fileSystem, root, settingsManager, manager } = harness();
  await settingsManager.updateSettings({ instagramMediaPath: "Missing/Media/Instagram" });
  await fileSystem.getDirectory(root, "Media", { create: true });

  const location = await manager.resolve({ vault: root });
  assert.deepEqual(location.segments, ["Media", "Instagram"]);
});

test("an invalid persisted path shape is discarded before discovery", async () => {
  const { fileSystem, root, settingsManager, manager } = harness();
  await settingsManager.updateSettings({ instagramMediaPath: "Unrelated/Files" });
  await fileSystem.getDirectory(root, "Media", { create: true });

  const location = await manager.resolve({ vault: root });
  assert.deepEqual(location.segments, ["Media", "Instagram"]);
});

test("ambiguous first-level Media casing stops instead of guessing", async () => {
  const { fileSystem, root, manager } = harness();
  await fileSystem.getDirectory(root, "Media", { create: true });
  await fileSystem.getDirectory(root, "MEDIA", { create: true });

  await assert.rejects(
    manager.resolve({ vault: root }),
    (error) => error.code === "AMBIGUOUS_DIRECTORY_CASE",
  );
});
