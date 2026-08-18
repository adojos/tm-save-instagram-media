import { buildReadOnlyCaptureSnapshot } from "../instagram/capture-snapshot.js";

export function createCaptureWorkflow({
  globalScope,
  ui,
  fileSystem,
  settingsManager,
  vaultManager,
  obsidianStorage,
  downloadStorage,
  buildSnapshot = buildReadOnlyCaptureSnapshot,
}) {
  let running = false;

  return Object.freeze({
    async run() {
      if (running) return;
      running = true;
      try {
        ui.showBusy("Inspecting the active Instagram item…");
        const [snapshot, settings] = await Promise.all([
          buildSnapshot({ globalScope }),
          settingsManager.getSettings(),
        ]);
        const options = await ui.showCaptureOptions({
          captureItem: snapshot.captureItem,
          warnings: snapshot.warnings,
          defaultMode: settings.lastMode,
        });
        if (!options) return;

        let result;
        if (options.mode === "download") {
          const parentDirectory = await fileSystem.chooseDirectory({ id: "instagram-download-destination" });
          ui.showBusy("Preparing downloads…");
          result = await downloadStorage.save({
            captureItem: snapshot.captureItem,
            title: options.title,
            parentDirectory,
            onProgress: (event) => ui.showProgress(event),
          });
        } else {
          // Permission renewal and any native picker stay directly downstream
          // of the user's Continue action, preserving browser user activation.
          const vault = await vaultManager.getVault();
          const preflight = await obsidianStorage.preflight({
            vault,
            postId: snapshot.captureItem.postId,
          });
          let destination = null;
          if (preflight.kind === "new") {
            const latestSettings = await settingsManager.getSettings();
            const initialSegments = latestSettings.lastNoteRelativePath
              ? latestSettings.lastNoteRelativePath.split("/").filter(Boolean)
              : [];
            destination = await ui.chooseVaultFolder({
              rootHandle: vault,
              fileSystem,
              initialSegments,
            });
            if (!destination) return;
          }
          ui.showBusy("Preparing Obsidian capture…");
          result = await obsidianStorage.save({
            captureItem: snapshot.captureItem,
            title: options.title,
            vault,
            noteDirectory: destination?.handle,
            noteDirectorySegments: destination?.segments ?? [],
            onProgress: (event) => ui.showProgress(event),
            onNoteCollision: (filename) => ui.chooseDecision({
              title: "Note already exists",
              message: filename + " already exists. Choose how to continue.",
              choices: [
                { label: "Cancel", value: "cancel" },
                { label: "Create Copy", value: "copy" },
                { label: "Replace", value: "replace", danger: true },
              ],
            }),
            onRecovery: () => ui.chooseDecision({
              title: "Interrupted capture found",
              message: "A verified incomplete capture exists. Continuing may replace only deterministic media owned by this Instagram Post ID.",
              choices: [
                { label: "Cancel", value: "cancel" },
                { label: "Continue", value: "continue", primary: true },
              ],
            }),
          });
          if (destination) {
            await settingsManager.updateSettings({
              lastNoteRelativePath: destination.segments.join("/"),
            });
          }
        }

        await settingsManager.updateSettings({ lastMode: options.mode });
        ui.closeModal();
        const warningText = result.warnings.length ? " " + result.warnings.join(" ") : "";
        ui.notify(
          options.mode === "obsidian"
            ? "Saved Markdown and " + result.files.length + " media file(s)." + warningText
            : "Downloaded " + result.files.length + " media file(s) to " + result.directoryName + "." + warningText,
        );
      } catch (error) {
        ui.closeModal();
        if (error?.name === "AbortError" || error?.code === "CANCELLED") {
          ui.notify("Capture cancelled.");
        } else {
          ui.notify(error?.message ?? "Capture failed.", { error: true, duration: 10000 });
        }
      } finally {
        running = false;
      }
    },
  });
}
