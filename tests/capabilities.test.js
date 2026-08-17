import assert from "node:assert/strict";
import test from "node:test";

import {
  detectRuntimeCapabilities,
  flattenCapabilityReport,
} from "../src/runtime/capabilities.js";

test("capability detection reports a ready Tampermonkey runtime", () => {
  const top = {};
  const windowObject = { top };
  windowObject.top = windowObject;

  const capabilities = detectRuntimeCapabilities({
    globalScope: {
      showDirectoryPicker() {},
      indexedDB: {},
      isSecureContext: true,
      window: windowObject,
    },
    gmRequest() {},
    gmRegisterMenuCommand() {},
  });

  assert.equal(capabilities.readyForFilesystemCapture, true);
  assert.equal(capabilities.readyForMediaDownload, true);
  assert.equal(capabilities.environment.topLevel, true);
});

test("capability detection degrades explicitly", () => {
  const capabilities = detectRuntimeCapabilities({
    globalScope: {
      isSecureContext: false,
    },
  });
  const report = flattenCapabilityReport(capabilities);

  assert.equal(capabilities.readyForFilesystemCapture, false);
  assert.equal(capabilities.readyForMediaDownload, false);
  assert.equal(report["Directory picker"], false);
  assert.equal(report["Secure context"], false);
});
