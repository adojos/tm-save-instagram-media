import { ApplicationController } from "./controller.js";
import { APP_CONFIG } from "../config.js";
import { createTampermonkeyMenuAdapter } from "../tampermonkey/menu.js";
import { createLogger } from "../utils/logging.js";
import { createFileSystemService } from "../filesystem/file-system.js";
import { createVaultManager } from "../filesystem/vault-manager.js";
import { createIndexedDbStore, createMemoryStore } from "../settings/indexeddb-store.js";
import { createSettingsManager } from "../settings/settings-manager.js";
import { createTampermonkeyBinaryRequest } from "../network/tampermonkey-network.js";
import { createMediaDownloader } from "../network/downloader.js";
import { createObsidianStorageProvider } from "../storage/obsidian-storage.js";
import { createDownloadStorageProvider } from "../storage/download-storage.js";
import { createAppUi } from "../ui/app-ui.js";
import { createCaptureWorkflow } from "./capture-workflow.js";
import { createPageLifecycle } from "./page-lifecycle.js";

export function bootstrap({
  globalScope = globalThis,
  gmRequest,
  gmRegisterMenuCommand,
} = {}) {
  const logger = createLogger({ name: APP_CONFIG.name });
  const menu = createTampermonkeyMenuAdapter(gmRegisterMenuCommand);
  const fileSystem = createFileSystemService({ globalScope });
  const store = globalScope.indexedDB
    ? createIndexedDbStore({ indexedDB: globalScope.indexedDB })
    : createMemoryStore();
  const settingsManager = createSettingsManager(store);
  const vaultManager = createVaultManager({ fileSystem, settingsManager });
  const requestBinary = typeof gmRequest === "function"
    ? createTampermonkeyBinaryRequest(gmRequest)
    : async () => { throw new Error("Tampermonkey media download API is unavailable."); };
  const downloader = createMediaDownloader({ requestBinary });
  const obsidianStorage = createObsidianStorageProvider({ fileSystem, downloader });
  const downloadStorage = createDownloadStorageProvider({ fileSystem, downloader });
  const ui = createAppUi({ documentObject: globalScope.document });
  const workflow = createCaptureWorkflow({
    globalScope, ui, fileSystem, settingsManager, vaultManager,
    obsidianStorage, downloadStorage,
  });
  const pageLifecycle = createPageLifecycle({
    globalScope,
    onAvailabilityChange(available, context) {
      ui.setCaptureAvailable(
        available,
        () => void workflow.run(),
        context?.routeKind === "reel" ? "Save Reel" : "Save Instagram post",
      );
    },
  });
  const controller = new ApplicationController({
    globalScope,
    logger,
    menu,
    gmRequest,
    workflow,
    ui,
    pageLifecycle,
    vaultManager,
    settingsManager,
  });

  controller.initialise();
  return controller;
}
