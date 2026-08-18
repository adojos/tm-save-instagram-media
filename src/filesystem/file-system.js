function assertEntryName(name) {
  if (
    typeof name !== "string" ||
    name.trim() === "" ||
    name === "." ||
    name === ".." ||
    /[\\/]/u.test(name)
  ) {
    throw new TypeError("Filesystem entry name must be one safe path segment.");
  }
}

function isNotFound(error) {
  return error?.name === "NotFoundError";
}

async function exists(getter) {
  try {
    await getter();
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

export function createFileSystemService({ globalScope = globalThis } = {}) {
  return Object.freeze({
    async chooseDirectory(options = {}) {
      if (typeof globalScope.showDirectoryPicker !== "function") {
        throw new Error("The File System Access directory picker is unavailable.");
      }
      return globalScope.showDirectoryPicker({ mode: "readwrite", ...options });
    },

    async queryPermission(handle, mode = "readwrite") {
      if (!handle || typeof handle.queryPermission !== "function") {
        return "prompt";
      }
      return handle.queryPermission({ mode });
    },

    async ensurePermission(handle, mode = "readwrite") {
      if (!handle) {
        return false;
      }
      if (await this.queryPermission(handle, mode) === "granted") {
        return true;
      }
      if (typeof handle.requestPermission !== "function") {
        return false;
      }
      return await handle.requestPermission({ mode }) === "granted";
    },

    async getDirectory(parent, name, { create = false } = {}) {
      assertEntryName(name);
      return parent.getDirectoryHandle(name, { create });
    },

    async getDirectoryPath(parent, segments, { create = false } = {}) {
      if (!Array.isArray(segments)) {
        throw new TypeError("Directory path segments must be an array.");
      }
      let current = parent;
      for (const segment of segments) {
        current = await this.getDirectory(current, segment, { create });
      }
      return current;
    },

    async directoryExists(parent, name) {
      assertEntryName(name);
      return exists(() => parent.getDirectoryHandle(name));
    },

    async fileExists(parent, name) {
      assertEntryName(name);
      return exists(() => parent.getFileHandle(name));
    },

    async readFile(parent, name) {
      assertEntryName(name);
      const handle = await parent.getFileHandle(name);
      return handle.getFile();
    },

    async readText(parent, name) {
      return (await this.readFile(parent, name)).text();
    },

    async writeBlob(parent, name, blob, { overwrite = false } = {}) {
      assertEntryName(name);
      if (!(blob instanceof Blob)) {
        throw new TypeError("writeBlob requires a Blob.");
      }
      if (!overwrite && await this.fileExists(parent, name)) {
        const error = new Error("Refusing to overwrite existing file: " + name);
        error.code = "FILE_EXISTS";
        throw error;
      }

      const fileHandle = await parent.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable({ keepExistingData: false });
      try {
        await writable.write(blob);
        await writable.close();
      } catch (error) {
        await writable.abort?.().catch?.(() => {});
        throw error;
      }
      return fileHandle;
    },

    async writeText(parent, name, text, options) {
      if (typeof text !== "string") {
        throw new TypeError("writeText requires a string.");
      }
      return this.writeBlob(
        parent,
        name,
        new Blob([text], { type: "text/plain;charset=utf-8" }),
        options,
      );
    },

    async removeEntry(parent, name, { recursive = false } = {}) {
      assertEntryName(name);
      return parent.removeEntry(name, { recursive });
    },

    async listDirectories(parent) {
      const directories = [];
      for await (const [name, handle] of parent.entries()) {
        if (handle.kind === "directory") {
          directories.push(Object.freeze({ name, handle }));
        }
      }
      return Object.freeze(directories.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
    },

    async createUniqueDirectory(parent, baseName) {
      assertEntryName(baseName);
      let suffix = 1;
      while (suffix < 10000) {
        const name = suffix === 1 ? baseName : baseName + " - " + suffix;
        if (!await this.directoryExists(parent, name)) {
          const handle = await parent.getDirectoryHandle(name, { create: true });
          return Object.freeze({ name, handle });
        }
        suffix += 1;
      }
      throw new Error("Unable to allocate a unique destination directory.");
    },
  });
}
