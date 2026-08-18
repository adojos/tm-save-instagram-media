import { APP_CONFIG } from "../config.js";
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
  return Object.freeze({
    async save({
      captureItem,
      title,
      vault,
      noteDirectory,
      noteDirectorySegments = [],
      onNoteCollision,
      onRecovery,
      onProgress,
    }) {
      if (!await fileSystem.ensurePermission(vault)) {
        throw new StorageError("Write permission for the Obsidian vault was denied.", "PERMISSION_DENIED");
      }
      const mediaRoot = await fileSystem.getDirectoryPath(vault, APP_CONFIG.mediaRootSegments, { create: true });
      const existing = await findManagedCaptureDirectory({ fileSystem, mediaRoot, postId: captureItem.postId });
      let mediaDirectory;
      let mediaDirectoryName;
      let noteTarget;
      let recovering = false;

      if (existing) {
        mediaDirectory = existing.handle;
        mediaDirectoryName = existing.name;
        const state = await inspectCaptureState({ fileSystem, directory: mediaDirectory, postId: captureItem.postId });
        if (state.kind === "complete") {
          await removeIncompleteMarkerBestEffort({ fileSystem, directory: mediaDirectory });
          throw new StorageError("This Instagram item already exists in the vault.", "DUPLICATE_CAPTURE");
        }
        if (state.kind !== "incomplete") {
          throw new StorageError("Existing capture directory has ambiguous or untracked state.", "CAPTURE_STATE_CONFLICT");
        }

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
        mediaDirectory = await fileSystem.getDirectory(mediaRoot, mediaDirectoryName, { create: true });
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
        joinPath([...APP_CONFIG.mediaRootSegments, mediaDirectoryName, filename]));
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
