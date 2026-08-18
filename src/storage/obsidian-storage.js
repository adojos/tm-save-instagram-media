import { generateObsidianMarkdown } from "../markdown/generator.js";
import { downloadCaptureMedia } from "../network/download-capture-media.js";
import { buildItemDirectoryName } from "../utils/filename.js";
import {
  createCompleteMarker,
  createIncompleteMarker,
  findManagedCaptureDirectory,
  inspectCaptureState,
  removeIncompleteMarkerBestEffort,
  writeCompleteMarker,
  writeIncompleteMarker,
} from "./capture-state.js";
import { StorageError } from "./errors.js";
import {
  allocateNoteTarget,
  inspectManagedNote,
  splitVaultRelativeFilePath,
} from "./note-target.js";

function joinPath(segments) {
  return segments.filter(Boolean).join("/");
}

async function validateExistingRecoveryNote({
  fileSystem,
  vault,
  mediaDirectory,
  mediaDirectoryName,
  marker,
}) {
  const target = splitVaultRelativeFilePath(marker.notePath);
  let noteDirectory;
  try {
    noteDirectory = await fileSystem.getDirectoryPath(vault, target.directorySegments);
  } catch {
    throw new StorageError(
      "The intended recovery note directory no longer exists.",
      "RECOVERY_NOTE_DIRECTORY_MISSING",
    );
  }
  if (!await fileSystem.fileExists(noteDirectory, target.filename)) {
    return Object.freeze({ exists: false, noteDirectory, target });
  }
  const inspected = inspectManagedNote(
    await fileSystem.readText(noteDirectory, target.filename),
    marker.postId,
    mediaDirectoryName,
  );
  if (!inspected.valid) {
    throw new StorageError("Existing recovery note conflicts with capture state.", "RECOVERY_NOTE_CONFLICT");
  }
  for (const filename of inspected.mediaFilenames) {
    if (!await fileSystem.fileExists(mediaDirectory, filename)) {
      throw new StorageError("Existing recovery note references missing media.", "RECOVERY_MEDIA_MISSING");
    }
  }
  return Object.freeze({ exists: true, noteDirectory, target, mediaFilenames: inspected.mediaFilenames });
}

export function createObsidianStorageProvider({ fileSystem, downloader, now = () => new Date().toISOString() }) {
  async function preflight({ vault, postId, mediaRoot }) {
    if (!await fileSystem.ensurePermission(vault)) {
      throw new StorageError("Write permission for the Obsidian vault was denied.", "PERMISSION_DENIED");
    }
    if (!mediaRoot?.handle || !Array.isArray(mediaRoot.segments)) {
      throw new StorageError("The Instagram Media location is not configured.", "MEDIA_ROOT_REQUIRED");
    }
    const existing = await findManagedCaptureDirectory({ fileSystem, mediaRoot: mediaRoot.handle, postId });
    if (!existing) {
      return Object.freeze({ kind: "new", mediaRoot });
    }
    const state = await inspectCaptureState({ fileSystem, directory: existing.handle, postId });
    if (state.kind === "complete") {
      await removeIncompleteMarkerBestEffort({ fileSystem, directory: existing.handle });
      throw new StorageError("This Instagram item already exists in the vault.", "DUPLICATE_CAPTURE");
    }
    if (state.kind !== "incomplete") {
      throw new StorageError("Existing capture directory has ambiguous or untracked state.", "CAPTURE_STATE_CONFLICT");
    }
    return Object.freeze({ kind: "incomplete", mediaRoot, existing, state });
  }

  return Object.freeze({
    preflight,

    async save({
      captureItem,
      title,
      vault,
      mediaRoot,
      noteDirectory,
      noteDirectorySegments = [],
      onNoteCollision,
      onRecovery,
      onProgress,
    }) {
      const checked = await preflight({ vault, postId: captureItem.postId, mediaRoot });
      const resolvedMediaRoot = checked.mediaRoot;
      const existing = checked.kind === "incomplete" ? checked.existing : null;
      let mediaDirectory;
      let mediaDirectoryName;
      let noteTarget;
      let recovering = false;

      if (existing) {
        mediaDirectory = existing.handle;
        mediaDirectoryName = existing.name;
        const state = checked.state;

        const existingNote = await validateExistingRecoveryNote({
          fileSystem, vault, mediaDirectory, mediaDirectoryName, marker: state.marker,
        });
        if (existingNote.exists) {
          const completeMarker = createCompleteMarker({
            postId: captureItem.postId,
            notePath: state.marker.notePath,
            mediaFilenames: existingNote.mediaFilenames,
            completedAt: now(),
          });
          await writeCompleteMarker({ fileSystem, directory: mediaDirectory, marker: completeMarker });
          await removeIncompleteMarkerBestEffort({ fileSystem, directory: mediaDirectory });
          return Object.freeze({ mode: "obsidian", recoveredByFinalization: true, notePath: state.marker.notePath, files: existingNote.mediaFilenames, warnings: Object.freeze([]) });
        }

        if (await onRecovery?.(state.marker) !== "continue") {
          throw new StorageError("Interrupted capture recovery was cancelled.", "CANCELLED");
        }
        recovering = true;
        noteTarget = existingNote.target;
        noteDirectory = existingNote.noteDirectory ?? await fileSystem.getDirectoryPath(vault, noteTarget.directorySegments);
      } else {
        if (!noteDirectory) {
          throw new StorageError("A vault-relative note destination is required.", "NOTE_DESTINATION_REQUIRED");
        }
        noteTarget = await allocateNoteTarget({ fileSystem, directory: noteDirectory, title, onCollision: onNoteCollision });
        mediaDirectoryName = buildItemDirectoryName(title, captureItem.postId);
        mediaDirectory = await fileSystem.getDirectory(resolvedMediaRoot.handle, mediaDirectoryName, { create: true });
        const notePath = joinPath([...noteDirectorySegments, noteTarget.filename]);
        const incompleteMarker = createIncompleteMarker({ postId: captureItem.postId, notePath, startedAt: now() });
        await writeIncompleteMarker({ fileSystem, directory: mediaDirectory, marker: incompleteMarker });
      }

      const notePath = recovering
        ? joinPath([...noteTarget.directorySegments, noteTarget.filename])
        : joinPath([...noteDirectorySegments, noteTarget.filename]);
      const downloaded = await downloadCaptureMedia({ captureItem, downloader, onProgress });

      for (const file of downloaded.files) {
        await fileSystem.writeBlob(mediaDirectory, file.filename, file.download.blob, { overwrite: recovering });
      }

      const mediaPaths = downloaded.files.map(({ filename }) =>
        joinPath([...resolvedMediaRoot.segments, mediaDirectoryName, filename]));
      const markdown = generateObsidianMarkdown({ captureItem: downloaded.captureItem, title, mediaPaths });
      await fileSystem.writeText(noteDirectory, noteTarget.filename, markdown, {
        overwrite: recovering ? false : noteTarget.overwrite,
      });

      const completeMarker = createCompleteMarker({
        postId: captureItem.postId,
        notePath,
        mediaFilenames: downloaded.files.map(({ filename }) => filename),
        completedAt: now(),
      });
      await writeCompleteMarker({ fileSystem, directory: mediaDirectory, marker: completeMarker });
      const cleaned = await removeIncompleteMarkerBestEffort({ fileSystem, directory: mediaDirectory });

      return Object.freeze({
        mode: "obsidian",
        recoveredByFinalization: false,
        notePath,
        files: Object.freeze(downloaded.files.map(({ filename }) => filename)),
        warnings: Object.freeze([
          ...downloaded.warnings,
          ...(cleaned ? [] : ["Capture completed, but the stale incomplete marker could not be removed."]),
        ]),
      });
    },
  });
}
