import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryStore } from "../src/settings/indexeddb-store.js";
import { createSettingsManager } from "../src/settings/settings-manager.js";

test("settings defaults keep the fixed v1 Instagram media root", async () => {
  const manager = createSettingsManager(createMemoryStore());
  const settings = await manager.getSettings();

  assert.equal(settings.instagramMediaPath, "media/Instagram");
  assert.equal(settings.lastMode, "obsidian");
});

test("settings update allowed preferences but not the fixed media root", async () => {
  const manager = createSettingsManager(createMemoryStore());
  const settings = await manager.updateSettings({
    lastMode: "download",
    lastNoteRelativePath: "AI/Notes",
    instagramMediaPath: "Other/Media",
    debug: true,
  });

  assert.equal(settings.lastMode, "download");
  assert.equal(settings.lastNoteRelativePath, "AI/Notes");
  assert.equal(settings.instagramMediaPath, "media/Instagram");
  assert.equal(settings.debug, true);
});

test("vault handle is persisted separately and reset clears note location", async () => {
  const manager = createSettingsManager(createMemoryStore());
  const handle = { kind: "directory", name: "Vault" };
  await manager.setVaultHandle(handle);
  await manager.updateSettings({ lastNoteRelativePath: "AI/Notes" });

  assert.equal(await manager.getVaultHandle(), handle);
  await manager.resetVault();
  assert.equal(await manager.getVaultHandle(), undefined);
  assert.equal((await manager.getSettings()).lastNoteRelativePath, "");
});
