import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryStore } from "../src/settings/indexeddb-store.js";
import { createSettingsManager } from "../src/settings/settings-manager.js";

test("settings defaults leave the v1.1 Instagram media root unresolved", async () => {
  const manager = createSettingsManager(createMemoryStore());
  const settings = await manager.getSettings();

  assert.equal(settings.instagramMediaPath, "");
  assert.equal(settings.lastMode, "obsidian");
  assert.equal(settings.vaultRootConfirmed, false);
});

test("settings accept a safe configured vault-relative media path", async () => {
  const manager = createSettingsManager(createMemoryStore());
  const settings = await manager.updateSettings({
    lastMode: "download",
    lastNoteRelativePath: "AI/Notes",
    instagramMediaPath: "Attachments/Media/Instagram",
    vaultRootConfirmed: true,
    debug: true,
  });

  assert.equal(settings.lastMode, "download");
  assert.equal(settings.lastNoteRelativePath, "AI/Notes");
  assert.equal(settings.instagramMediaPath, "Attachments/Media/Instagram");
  assert.equal(settings.vaultRootConfirmed, true);
  assert.equal(settings.debug, true);
});

test("v1 settings migrate without silently retaining the old fixed media root", async () => {
  const store = createMemoryStore([["settings", {
    schemaVersion: 1,
    instagramMediaPath: "media/Instagram",
    lastMode: "download",
    lastNoteRelativePath: "Web Clippings",
    debug: true,
  }]]);
  const settings = await createSettingsManager(store).getSettings();

  assert.equal(settings.instagramMediaPath, "");
  assert.equal(settings.vaultRootConfirmed, false);
  assert.equal(settings.lastMode, "download");
  assert.equal(settings.lastNoteRelativePath, "Web Clippings");
});

test("vault handle is persisted separately and reset clears note location", async () => {
  const manager = createSettingsManager(createMemoryStore());
  const handle = { kind: "directory", name: "Vault" };
  await manager.setVaultHandle(handle);
  await manager.updateSettings({
    lastNoteRelativePath: "AI/Notes",
    instagramMediaPath: "Media/Instagram",
    vaultRootConfirmed: true,
  });

  assert.equal(await manager.getVaultHandle(), handle);
  await manager.resetVault();
  assert.equal(await manager.getVaultHandle(), undefined);
  assert.equal((await manager.getSettings()).lastNoteRelativePath, "");
  assert.equal((await manager.getSettings()).instagramMediaPath, "");
  assert.equal((await manager.getSettings()).vaultRootConfirmed, false);
});
