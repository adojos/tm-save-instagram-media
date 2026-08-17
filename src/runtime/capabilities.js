export function detectRuntimeCapabilities({
  globalScope = globalThis,
  gmRequest,
  gmRegisterMenuCommand,
} = {}) {
  const capabilities = {
    tampermonkey: {
      networkRequest: typeof gmRequest === "function",
      menuCommand: typeof gmRegisterMenuCommand === "function",
    },
    filesystem: {
      directoryPicker:
        typeof globalScope?.showDirectoryPicker === "function",
    },
    persistence: {
      indexedDB: Boolean(globalScope?.indexedDB),
    },
    environment: {
      secureContext: globalScope?.isSecureContext === true,
      topLevel:
        !globalScope?.window ||
        !globalScope?.window?.top ||
        globalScope.window === globalScope.window.top,
    },
  };

  return Object.freeze({
    ...capabilities,
    readyForFilesystemCapture:
      capabilities.filesystem.directoryPicker &&
      capabilities.persistence.indexedDB &&
      capabilities.environment.secureContext,
    readyForMediaDownload: capabilities.tampermonkey.networkRequest,
  });
}

export function flattenCapabilityReport(capabilities) {
  return {
    "Tampermonkey network API":
      capabilities.tampermonkey.networkRequest,
    "Tampermonkey menu API": capabilities.tampermonkey.menuCommand,
    "Directory picker": capabilities.filesystem.directoryPicker,
    IndexedDB: capabilities.persistence.indexedDB,
    "Secure context": capabilities.environment.secureContext,
    "Top-level page": capabilities.environment.topLevel,
    "Filesystem capture ready":
      capabilities.readyForFilesystemCapture,
    "Media download ready": capabilities.readyForMediaDownload,
  };
}
