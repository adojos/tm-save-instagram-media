import assert from "node:assert/strict";
import test from "node:test";

import { createFileSystemService } from "../src/filesystem/file-system.js";

function notFound() {
  const error = new Error("not found");
  error.name = "NotFoundError";
  return error;
}

class FakeFileHandle {
  kind = "file";
  #blob = new Blob([]);

  async getFile() {
    return this.#blob;
  }

  async createWritable() {
    return {
      write: async (blob) => {
        this.#blob = blob;
      },
      close: async () => {},
      abort: async () => {},
    };
  }
}

class FakeDirectoryHandle {
  kind = "directory";
  directories = new Map();
  files = new Map();

  async getDirectoryHandle(name, { create = false } = {}) {
    if (!this.directories.has(name) && create) {
      this.directories.set(name, new FakeDirectoryHandle());
    }
    if (!this.directories.has(name)) {
      throw notFound();
    }
    return this.directories.get(name);
  }

  async getFileHandle(name, { create = false } = {}) {
    if (!this.files.has(name) && create) {
      this.files.set(name, new FakeFileHandle());
    }
    if (!this.files.has(name)) {
      throw notFound();
    }
    return this.files.get(name);
  }

  async *entries() {
    yield* this.directories.entries();
    yield* this.files.entries();
  }

  async removeEntry(name) {
    if (!this.files.delete(name) && !this.directories.delete(name)) {
      throw notFound();
    }
  }
}

test("filesystem resolves and creates nested directory paths", async () => {
  const service = createFileSystemService();
  const root = new FakeDirectoryHandle();
  const result = await service.getDirectoryPath(root, ["media", "Instagram"], {
    create: true,
  });

  assert.equal(result.kind, "directory");
  assert.equal(await service.directoryExists(root, "media"), true);
});

test("filesystem writes without overwriting by default", async () => {
  const service = createFileSystemService();
  const root = new FakeDirectoryHandle();

  await service.writeText(root, "note.md", "first");
  await assert.rejects(
    service.writeText(root, "note.md", "second"),
    (error) => error.code === "FILE_EXISTS",
  );
  assert.equal(await service.readText(root, "note.md"), "first");

  await service.writeText(root, "note.md", "second", { overwrite: true });
  assert.equal(await service.readText(root, "note.md"), "second");
});

test("filesystem allocates Mode B style numbered directories", async () => {
  const service = createFileSystemService();
  const root = new FakeDirectoryHandle();
  await root.getDirectoryHandle("Title - ABC123", { create: true });
  await root.getDirectoryHandle("Title - ABC123 - 2", { create: true });

  const allocated = await service.createUniqueDirectory(root, "Title - ABC123");

  assert.equal(allocated.name, "Title - ABC123 - 3");
});

test("filesystem rejects path traversal entry names", async () => {
  const service = createFileSystemService();
  const root = new FakeDirectoryHandle();

  await assert.rejects(service.getDirectory(root, "../escape", { create: true }));
  await assert.rejects(service.writeText(root, "folder/file", "unsafe"));
});

test("filesystem permission request is explicit", async () => {
  const service = createFileSystemService();
  const calls = [];
  const handle = {
    async queryPermission(options) {
      calls.push(["query", options.mode]);
      return "prompt";
    },
    async requestPermission(options) {
      calls.push(["request", options.mode]);
      return "granted";
    },
  };

  assert.equal(await service.ensurePermission(handle), true);
  assert.deepEqual(calls, [["query", "readwrite"], ["request", "readwrite"]]);
});

test("filesystem resolves configured directory paths case-insensitively with actual casing", async () => {
  const service = createFileSystemService();
  const root = new FakeDirectoryHandle();
  const media = await root.getDirectoryHandle("MEDIA", { create: true });
  await media.getDirectoryHandle("instagram", { create: true });

  const resolved = await service.resolveDirectoryPath(root, ["Media", "Instagram"]);
  assert.deepEqual(resolved.segments, ["MEDIA", "instagram"]);
});
