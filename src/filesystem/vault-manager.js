function cancelled() {
  const error = new Error("Vault selection was cancelled.");
  error.code = "CANCELLED";
  return error;
}

export function createVaultManager({
  fileSystem,
  settingsManager,
  onBeforeSelection,
  onUnverifiedVault,
}) {
  if (!fileSystem || !settingsManager) {
    throw new TypeError("Filesystem and settings services are required.");
  }

  async function classifyVault(handle, source) {
    if (await fileSystem.directoryExists(handle, ".obsidian")) return "use";
    return await onUnverifiedVault?.({ handle, source }) ?? "use";
  }

  async function confirmAndPersist(handle, source) {
    const decision = await classifyVault(handle, source);
    if (decision !== "use") return decision;
    await settingsManager.setVaultHandle(handle);
    await settingsManager.updateSettings({
      vaultRootConfirmed: true,
      ...(source === "selected" ? {
        instagramMediaPath: "",
        lastNoteRelativePath: "",
      } : {}),
    });
    return "use";
  }

  async function configureVault() {
    if (onBeforeSelection && await onBeforeSelection() !== "continue") {
      throw cancelled();
    }
    while (true) {
      const handle = await fileSystem.chooseDirectory({ id: "obsidian-vault" });
      if (!await fileSystem.ensurePermission(handle)) {
        throw new Error("Write permission for the selected vault was not granted.");
      }
      const decision = await confirmAndPersist(handle, "selected");
      if (decision === "use") return handle;
      if (decision !== "choose") throw cancelled();
    }
  }

  return Object.freeze({
    configureVault,

    async getVault({ allowSelection = true } = {}) {
      const [handle, settings] = await Promise.all([
        settingsManager.getVaultHandle(),
        settingsManager.getSettings(),
      ]);
      if (handle && await fileSystem.ensurePermission(handle)) {
        if (settings.vaultRootConfirmed) return handle;
        const decision = await confirmAndPersist(handle, "persisted");
        if (decision === "use") return handle;
        if (decision !== "choose") throw cancelled();
      }
      if (!allowSelection) {
        return null;
      }
      return configureVault();
    },

    reset() {
      return settingsManager.resetVault();
    },
  });
}
