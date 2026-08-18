import { downloadCaptureMedia } from "../network/download-capture-media.js";
import { buildItemDirectoryName } from "../utils/filename.js";

export function createDownloadStorageProvider({ fileSystem, downloader }) {
  return Object.freeze({
    async save({ captureItem, title, parentDirectory, onProgress }) {
      if (!await fileSystem.ensurePermission(parentDirectory)) {
        throw new Error("Write permission for the download destination was denied.");
      }
      const directoryName = buildItemDirectoryName(title, captureItem.postId);
      const destination = await fileSystem.createUniqueDirectory(parentDirectory, directoryName);
      const downloaded = await downloadCaptureMedia({ captureItem, downloader, onProgress });

      for (const file of downloaded.files) {
        await fileSystem.writeBlob(destination.handle, file.filename, file.download.blob, { overwrite: false });
      }

      return Object.freeze({
        mode: "download",
        directoryName: destination.name,
        files: Object.freeze(downloaded.files.map(({ filename }) => filename)),
        warnings: downloaded.warnings,
      });
    },
  });
}
