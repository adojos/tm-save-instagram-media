import assert from "node:assert/strict";
import test from "node:test";

import { createVaultManager } from "../src/filesystem/vault-manager.js";

test("vault manager reuses a persisted permitted handle", async () => {
  const handle = { kind: "directory", name: "Vault" };
  let pickerCalls = 0;
  const manager = createVaultManager({
    fileSystem: {
      ensurePermission: async () => true,
      chooseDirectory: async () => {
        pickerCalls += 1;
        return handle;
      },
    },
    settingsManager: {
      getVaultHandle: async () => handle,
      getSettings: async () => ({ vaultRootConfirmed: true }),
      setVaultHandle: async () => {},
      updateSettings: async () => {},
    },
  });

  assert.equal(await manager.getVault(), handle);
  assert.equal(pickerCalls, 0);
});

test("vault manager selects and persists when no reusable handle exists", async () => {
  const handle = { kind: "directory", name: "Vault" };
  let saved;
  const manager = createVaultManager({
    fileSystem: {
      ensurePermission: async (candidate) => candidate === handle,
      directoryExists: async () => true,
      chooseDirectory: async () => handle,
    },
    settingsManager: {
      getVaultHandle: async () => null,
      getSettings: async () => ({ vaultRootConfirmed: false }),
      setVaultHandle: async (candidate) => {
        saved = candidate;
      },
      updateSettings: async () => {},
    },
  });

  assert.equal(await manager.getVault(), handle);
  assert.equal(saved, handle);
});

test("vault manager can decline selection for non-interactive checks", async () => {
  const manager = createVaultManager({
    fileSystem: { ensurePermission: async () => false },
    settingsManager: {
      getVaultHandle: async () => null,
      getSettings: async () => ({ vaultRootConfirmed: false }),
    },
  });

  assert.equal(await manager.getVault({ allowSelection: false }), null);
});

test("unconfirmed persisted subfolder can be replaced with the actual vault root", async () => {
  const subfolder = { kind: "directory", name: "Web Clippings" };
  const vault = { kind: "directory", name: "My Vault" };
  const saved = [];
  const manager = createVaultManager({
    fileSystem: {
      ensurePermission: async () => true,
      directoryExists: async (handle, name) => handle === vault && name === ".obsidian",
      chooseDirectory: async () => vault,
    },
    settingsManager: {
      getVaultHandle: async () => subfolder,
      getSettings: async () => ({ vaultRootConfirmed: false }),
      setVaultHandle: async (handle) => saved.push(handle),
      updateSettings: async () => {},
    },
    onBeforeSelection: async () => "continue",
    onUnverifiedVault: async () => "choose",
  });

  assert.equal(await manager.getVault(), vault);
  assert.equal(saved.at(-1), vault);
});
