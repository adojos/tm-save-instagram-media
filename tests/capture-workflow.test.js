import assert from "node:assert/strict";
import test from "node:test";
import { createCaptureWorkflow } from "../src/app/capture-workflow.js";

const captureItem = Object.freeze({ postId: "ABC123", author: "author", contentType: "image", mediaCount: 1, proposedTitle: "Title" });

function harness({ mode = "download", preflightKind = "new", storageError } = {}) {
  const calls = [];
  const settings = { lastMode: mode, lastNoteRelativePath: "Notes" };
  const ui = {
    showBusy(message) { calls.push(["busy", message]); },
    showProgress() {},
    closeModal() { calls.push(["close"]); },
    notify(message, options) { calls.push(["notify", message, options]); },
    async showCaptureOptions() { return { mode, title: "Edited title" }; },
    async chooseVaultFolder() {
      calls.push(["folder-browser"]);
      return { handle: { kind: "directory", name: "Notes" }, segments: ["Notes"] };
    },
    async chooseDecision() { return "continue"; },
  };
  const settingsManager = {
    async getSettings() { return { ...settings }; },
    async updateSettings(patch) { Object.assign(settings, patch); calls.push(["settings", patch]); },
  };
  const parent = { kind: "directory", name: "Downloads" };
  const vault = { kind: "directory", name: "Vault" };
  const mediaRoot = { kind: "directory", name: "Instagram" };
  const workflow = createCaptureWorkflow({
    globalScope: {}, ui, settingsManager,
    fileSystem: {
      async chooseDirectory() { calls.push(["directory-picker"]); return parent; },
    },
    vaultManager: {
      async getVault() { return vault; },
      async configureVault() { calls.push(["vault-picker"]); return vault; },
    },
    mediaRootManager: {
      async resolve() {
        calls.push(["media-root"]);
        return { handle: mediaRoot, segments: ["Media", "Instagram"] };
      },
    },
    obsidianStorage: {
      async preflight() { calls.push(["preflight"]); if (storageError) throw storageError; return { kind: preflightKind }; },
      async save(options) { calls.push(["obsidian-save", options]); return { files: ["x.jpg"], warnings: [] }; },
    },
    downloadStorage: {
      async save(options) { calls.push(["download-save", options]); return { files: ["x.jpg"], warnings: [], directoryName: "Edited title - ABC123" }; },
    },
    async buildSnapshot() { return { captureItem, warnings: [] }; },
  });
  return { workflow, calls, settings };
}

test("download workflow selects a parent and invokes Mode B storage", async () => {
  const { workflow, calls, settings } = harness({ mode: "download" });
  await workflow.run();

  assert.ok(calls.some(([name]) => name === "directory-picker"));
  assert.ok(calls.some(([name]) => name === "download-save"));
  assert.ok(!calls.some(([name]) => name === "folder-browser"));
  assert.equal(settings.lastMode, "download");
});

test("new Mode A capture preflights before vault folder browsing", async () => {
  const { workflow, calls, settings } = harness({ mode: "obsidian", preflightKind: "new" });
  await workflow.run();

  const preflightIndex = calls.findIndex(([name]) => name === "preflight");
  const browserIndex = calls.findIndex(([name]) => name === "folder-browser");
  assert.ok(preflightIndex >= 0 && browserIndex > preflightIndex);
  assert.ok(calls.some(([name]) => name === "obsidian-save"));
  assert.equal(settings.lastNoteRelativePath, "Notes");
});

test("interrupted Mode A recovery skips destination browsing", async () => {
  const { workflow, calls } = harness({ mode: "obsidian", preflightKind: "incomplete" });
  await workflow.run();

  assert.ok(calls.some(([name]) => name === "preflight"));
  assert.ok(!calls.some(([name]) => name === "folder-browser"));
  assert.ok(calls.some(([name]) => name === "obsidian-save"));
});

test("storage errors are surfaced without escaping the workflow", async () => {
  const error = new Error("Already captured");
  error.code = "DUPLICATE_CAPTURE";
  const { workflow, calls } = harness({ mode: "obsidian", storageError: error });
  await workflow.run();

  const notification = calls.find(([name]) => name === "notify");
  assert.equal(notification[1], "Already captured");
  assert.equal(notification[2].error, true);
});
