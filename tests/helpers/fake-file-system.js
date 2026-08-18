import { createFileSystemService } from "../../src/filesystem/file-system.js";

function notFound() {
  const error = new Error("not found");
  error.name = "NotFoundError";
  return error;
}

class FakeFileHandle {
  kind = "file";
  #blob = new Blob([]);

  async getFile() { return this.#blob; }
  async createWritable() {
    return {
      write: async (blob) => { this.#blob = blob; },
      close: async () => {},
      abort: async () => {},
    };
  }
}

export class FakeDirectoryHandle {
  kind = "directory";
  directories = new Map();
  files = new Map();
  constructor(name = "directory") { this.name = name; }
  async queryPermission() { return "granted"; }
  async requestPermission() { return "granted"; }
  async getDirectoryHandle(name, { create = false } = {}) {
    if (!this.directories.has(name) && create) this.directories.set(name, new FakeDirectoryHandle(name));
    if (!this.directories.has(name)) throw notFound();
    return this.directories.get(name);
  }
  async getFileHandle(name, { create = false } = {}) {
    if (!this.files.has(name) && create) this.files.set(name, new FakeFileHandle());
    if (!this.files.has(name)) throw notFound();
    return this.files.get(name);
  }
  async *entries() {
    yield* this.directories.entries();
    yield* this.files.entries();
  }
  async removeEntry(name) {
    if (!this.files.delete(name) && !this.directories.delete(name)) throw notFound();
  }
}

export function createFakeFileSystem() {
  return { fileSystem: createFileSystemService(), root: new FakeDirectoryHandle("root") };
}
