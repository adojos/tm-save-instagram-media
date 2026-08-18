import { APP_CONFIG } from "../config.js";

function splitRelativePath(path) {
  if (typeof path !== "string" || !path) return [];
  const segments = path.replace(/\\/gu, "/").split("/").filter(Boolean);
  return segments.some((segment) => segment === "." || segment === "..")
    ? []
    : segments;
}

function cancelled() {
  const error = new Error("Media location selection was cancelled.");
  error.code = "CANCELLED";
  return error;
}

function isConfiguredInstagramPath(segments) {
  return segments.length >= 2 &&
    segments.at(-2).toLocaleLowerCase("en-US") ===
      APP_CONFIG.mediaDirectoryName.toLocaleLowerCase("en-US") &&
    segments.at(-1).toLocaleLowerCase("en-US") ===
      APP_CONFIG.instagramDirectoryName.toLocaleLowerCase("en-US");
}

export function createMediaRootManager({ fileSystem, settingsManager }) {
  if (!fileSystem || !settingsManager) {
    throw new TypeError("Filesystem and settings services are required.");
  }

  async function persist(location) {
    await settingsManager.updateSettings({
      instagramMediaPath: location.segments.join("/"),
    });
    return location;
  }

  async function ensureInstagram(mediaDirectory, parentSegments) {
    const instagram = await fileSystem.resolveDirectory(
      mediaDirectory.handle,
      APP_CONFIG.instagramDirectoryName,
      { create: true },
    );
    return Object.freeze({
      handle: instagram.handle,
      segments: Object.freeze([...parentSegments, mediaDirectory.name, instagram.name]),
    });
  }

  return Object.freeze({
    async resolve({ vault, chooseLocation }) {
      const settings = await settingsManager.getSettings();
      const persistedSegments = splitRelativePath(settings.instagramMediaPath);
      if (isConfiguredInstagramPath(persistedSegments)) {
        const persisted = await fileSystem.resolveDirectoryPath(
          vault,
          persistedSegments,
          { create: false },
        );
        if (persisted) return persist(persisted);
      }
      if (persistedSegments.length) {
        await settingsManager.updateSettings({ instagramMediaPath: "" });
      }

      const rootMedia = await fileSystem.resolveDirectory(
        vault,
        APP_CONFIG.mediaDirectoryName,
      );
      if (rootMedia) {
        return persist(await ensureInstagram(rootMedia, []));
      }

      const choice = await chooseLocation?.();
      if (!choice) throw cancelled();

      if (choice.kind === "root") {
        const media = await fileSystem.resolveDirectory(
          vault,
          APP_CONFIG.mediaDirectoryName,
          { create: true },
        );
        return persist(await ensureInstagram(media, []));
      }

      if (
        choice.kind !== "custom" ||
        !choice.handle ||
        !Array.isArray(choice.segments)
      ) {
        throw new TypeError("Custom Media location must be vault-relative.");
      }

      const selectedIsMedia = choice.segments.at(-1)?.toLocaleLowerCase("en-US") ===
        APP_CONFIG.mediaDirectoryName.toLocaleLowerCase("en-US");
      const media = selectedIsMedia
        ? Object.freeze({ name: choice.segments.at(-1), handle: choice.handle })
        : await fileSystem.resolveDirectory(
          choice.handle,
          APP_CONFIG.mediaDirectoryName,
          { create: true },
        );
      const parentSegments = selectedIsMedia
        ? choice.segments.slice(0, -1)
        : choice.segments;
      return persist(await ensureInstagram(media, parentSegments));
    },
  });
}
