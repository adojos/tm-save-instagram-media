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
      setVaultHandle: async () => {},
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
      chooseDirectory: async () => handle,
    },
    settingsManager: {
      getVaultHandle: async () => null,
      setVaultHandle: async (candidate) => {
        saved = candidate;
      },
    },
  });

  assert.equal(await manager.getVault(), handle);
  assert.equal(saved, handle);
});

test("vault manager can decline selection for non-interactive checks", async () => {
  const manager = createVaultManager({
    fileSystem: { ensurePermission: async () => false },
    settingsManager: { getVaultHandle: async () => null },
  });

  assert.equal(await manager.getVault({ allowSelection: false }), null);
});
