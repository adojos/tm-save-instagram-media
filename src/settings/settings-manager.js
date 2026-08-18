import { APP_CONFIG } from "../config.js";

const SETTINGS_KEY = "settings";
const VAULT_HANDLE_KEY = "vault-handle";

const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: APP_CONFIG.settingsSchemaVersion,
  instagramMediaPath: APP_CONFIG.mediaRootSegments.join("/"),
  lastMode: "obsidian",
  lastNoteRelativePath: "",
  debug: false,
});

function normalizeSettings(value) {
  if (
    !value ||
    value.schemaVersion !== APP_CONFIG.settingsSchemaVersion
  ) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    ...DEFAULT_SETTINGS,
    lastMode: ["obsidian", "download"].includes(value.lastMode)
      ? value.lastMode
      : DEFAULT_SETTINGS.lastMode,
    lastNoteRelativePath: typeof value.lastNoteRelativePath === "string"
      ? value.lastNoteRelativePath
      : "",
    debug: value.debug === true,
  };
}

export function createSettingsManager(store) {
  if (!store || typeof store.get !== "function" || typeof store.set !== "function") {
    throw new TypeError("A key-value settings store is required.");
  }

  return Object.freeze({
    async getSettings() {
      return Object.freeze(normalizeSettings(await store.get(SETTINGS_KEY)));
    },

    async updateSettings(patch) {
      const current = await this.getSettings();
      const next = normalizeSettings({ ...current, ...patch });
      await store.set(SETTINGS_KEY, next);
      return Object.freeze(next);
    },

    getVaultHandle() {
      return store.get(VAULT_HANDLE_KEY);
    },

    async setVaultHandle(handle) {
      if (!handle || handle.kind !== "directory") {
        throw new TypeError("Vault handle must be a directory handle.");
      }
      await store.set(VAULT_HANDLE_KEY, handle);
    },

    async resetVault() {
      await store.delete(VAULT_HANDLE_KEY);
      await this.updateSettings({ lastNoteRelativePath: "" });
    },
  });
}
