import { APP_CONFIG } from "../config.js";

export const INCOMPLETE_MARKER = ".capture-incomplete.json";
export const COMPLETE_MARKER = ".capture-complete.json";

function validPostId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/u.test(value);
}

function validPath(value) {
  return typeof value === "string" && value.trim() !== "" &&
    !/[\r\n]/u.test(value) && !value.split(/[\\/]/u).includes("..");
}

function validTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validateBase(value) {
  return Boolean(value) &&
    value.schemaVersion === APP_CONFIG.captureStateSchemaVersion &&
    validPostId(value.postId) && validPath(value.notePath);
}

export function createIncompleteMarker({ postId, notePath, startedAt }) {
  const marker = { schemaVersion: APP_CONFIG.captureStateSchemaVersion, postId, notePath, startedAt };
  if (!validateBase(marker) || !validTimestamp(startedAt)) {
    throw new TypeError("Incomplete capture marker fields are invalid.");
  }
  return Object.freeze(marker);
}

export function createCompleteMarker({ postId, notePath, mediaFilenames, completedAt }) {
  const marker = {
    schemaVersion: APP_CONFIG.captureStateSchemaVersion,
    postId,
    notePath,
    mediaFilenames,
    completedAt,
  };
  if (!validateBase(marker) || !validTimestamp(completedAt) ||
    !Array.isArray(mediaFilenames) || mediaFilenames.length < 1 ||
    mediaFilenames.some((name) => typeof name !== "string" || name === "" || /[\\/]/u.test(name))) {
    throw new TypeError("Complete capture marker fields are invalid.");
  }
  return Object.freeze({ ...marker, mediaFilenames: Object.freeze([...mediaFilenames]) });
}

function parseMarker(text, type) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return Object.freeze({ status: "malformed", reason: "invalid-json" });
  }
  try {
    const marker = type === "complete" ? createCompleteMarker(value) : createIncompleteMarker(value);
    return Object.freeze({ status: "valid", marker });
  } catch {
    return Object.freeze({ status: "malformed", reason: "invalid-schema" });
  }
}

async function readMarker(fileSystem, directory, filename, type) {
  if (!await fileSystem.fileExists(directory, filename)) {
    return Object.freeze({ status: "missing" });
  }
  try {
    return parseMarker(await fileSystem.readText(directory, filename), type);
  } catch {
    return Object.freeze({ status: "malformed", reason: "unreadable" });
  }
}

export async function inspectCaptureState({ fileSystem, directory, postId }) {
  const [complete, incomplete] = await Promise.all([
    readMarker(fileSystem, directory, COMPLETE_MARKER, "complete"),
    readMarker(fileSystem, directory, INCOMPLETE_MARKER, "incomplete"),
  ]);
  if (complete.status === "malformed" || incomplete.status === "malformed") {
    return Object.freeze({ kind: "conflict", reason: "malformed-marker" });
  }
  if (complete.status === "valid") {
    if (complete.marker.postId !== postId) {
      return Object.freeze({ kind: "conflict", reason: "identity-mismatch" });
    }
    return Object.freeze({ kind: "complete", marker: complete.marker, staleIncomplete: incomplete.status === "valid" });
  }
  if (incomplete.status === "valid") {
    if (incomplete.marker.postId !== postId) {
      return Object.freeze({ kind: "conflict", reason: "identity-mismatch" });
    }
    return Object.freeze({ kind: "incomplete", marker: incomplete.marker });
  }
  return Object.freeze({ kind: "untracked" });
}

export async function writeIncompleteMarker({ fileSystem, directory, marker, overwrite = false }) {
  return fileSystem.writeText(directory, INCOMPLETE_MARKER, JSON.stringify(marker, null, 2) + "\n", { overwrite });
}

export async function writeCompleteMarker({ fileSystem, directory, marker }) {
  return fileSystem.writeText(directory, COMPLETE_MARKER, JSON.stringify(marker, null, 2) + "\n", { overwrite: false });
}

export async function removeIncompleteMarkerBestEffort({ fileSystem, directory }) {
  try {
    if (await fileSystem.fileExists(directory, INCOMPLETE_MARKER)) {
      await fileSystem.removeEntry(directory, INCOMPLETE_MARKER);
    }
    return true;
  } catch {
    return false;
  }
}

export async function findManagedCaptureDirectory({ fileSystem, mediaRoot, postId }) {
  if (!validPostId(postId)) {
    throw new TypeError("postId must be a canonical Instagram ID.");
  }
  const suffix = " - " + postId;
  const matches = (await fileSystem.listDirectories(mediaRoot)).filter(({ name }) => name.endsWith(suffix));
  if (matches.length > 1) {
    const error = new Error("Multiple managed directories match the Post ID.");
    error.code = "AMBIGUOUS_CAPTURE_DIRECTORIES";
    throw error;
  }
  return matches[0] ?? null;
}
