import { buildNoteFilename } from "../utils/filename.js";
import { StorageError } from "./errors.js";

export async function allocateNoteTarget({ fileSystem, directory, title, onCollision }) {
  const proposed = buildNoteFilename(title);
  if (!await fileSystem.fileExists(directory, proposed)) {
    return Object.freeze({ filename: proposed, overwrite: false });
  }

  const choice = await onCollision?.(proposed);
  if (choice === "replace") {
    return Object.freeze({ filename: proposed, overwrite: true });
  }
  if (choice === "copy") {
    for (let suffix = 2; suffix < 10000; suffix += 1) {
      const filename = buildNoteFilename(title + " - " + suffix);
      if (!await fileSystem.fileExists(directory, filename)) {
        return Object.freeze({ filename, overwrite: false });
      }
    }
    throw new StorageError("Unable to allocate a copy note filename.", "NOTE_COPY_EXHAUSTED");
  }
  throw new StorageError("Capture cancelled at note collision.", "CANCELLED");
}

export function splitVaultRelativeFilePath(path) {
  if (typeof path !== "string" || path.trim() === "") {
    throw new StorageError("Stored note path is invalid.", "INVALID_NOTE_PATH");
  }
  const segments = path.replace(/\\/gu, "/").split("/").filter(Boolean);
  if (segments.length < 1 || segments.some((segment) => segment === ".." || segment === ".")) {
    throw new StorageError("Stored note path is unsafe.", "INVALID_NOTE_PATH");
  }
  return Object.freeze({ directorySegments: Object.freeze(segments.slice(0, -1)), filename: segments.at(-1) });
}

export function inspectManagedNote(text, postId, mediaDirectoryName) {
  if (typeof text !== "string") {
    return Object.freeze({ valid: false, reason: "unreadable-note" });
  }
  const idMatch = text.match(/^instagram_id:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/mu);
  if (!idMatch || idMatch[1] !== postId) {
    return Object.freeze({ valid: false, reason: "identity-mismatch" });
  }
  const filenames = [];
  for (const match of text.matchAll(/!\[\[([^\]\r\n]+)\]\]/gu)) {
    const path = match[1].replace(/\\/gu, "/");
    const segments = path.split("/");
    const filename = segments.at(-1);
    if (segments.at(-2) === mediaDirectoryName && filename && !/[\\/]/u.test(filename)) {
      filenames.push(filename);
    }
  }
  if (filenames.length < 1) {
    return Object.freeze({ valid: false, reason: "missing-media-links" });
  }
  return Object.freeze({ valid: true, mediaFilenames: Object.freeze([...new Set(filenames)]) });
}
