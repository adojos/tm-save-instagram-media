export function createVaultManager({ fileSystem, settingsManager }) {
  if (!fileSystem || !settingsManager) {
    throw new TypeError("Filesystem and settings services are required.");
  }

  return Object.freeze({
    async configureVault() {
      const handle = await fileSystem.chooseDirectory({ id: "obsidian-vault" });
      if (!await fileSystem.ensurePermission(handle)) {
        throw new Error("Write permission for the selected vault was not granted.");
      }
      await settingsManager.setVaultHandle(handle);
      return handle;
    },

    async getVault({ allowSelection = true } = {}) {
      let handle = await settingsManager.getVaultHandle();
      if (handle && await fileSystem.ensurePermission(handle)) {
        return handle;
      }
      if (!allowSelection) {
        return null;
      }
      handle = await this.configureVault();
      return handle;
    },

    reset() {
      return settingsManager.resetVault();
    },
  });
}
