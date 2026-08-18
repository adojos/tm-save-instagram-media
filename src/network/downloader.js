import { validateMediaBlob } from "./media-format.js";

const TRANSIENT_STATUS_CODES = new Set([408, 425, 429]);

export class MediaDownloadError extends Error {
  constructor(message, code, options) {
    super(message, options);
    this.name = "MediaDownloadError";
    this.code = code;
  }
}

function isTransientStatus(status) {
  return TRANSIENT_STATUS_CODES.has(status) || status >= 500;
}

function assertMediaUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new MediaDownloadError("Media URL is invalid.", "INVALID_URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new MediaDownloadError(
      "Media URL must use HTTP or HTTPS.",
      "INVALID_URL",
    );
  }
}

function normalizeBody(body, contentType) {
  if (body instanceof Blob) {
    return body;
  }

  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return new Blob([body], { type: contentType || "" });
  }

  throw new MediaDownloadError(
    "Media response did not contain binary data.",
    "INVALID_BODY",
  );
}

export function createMediaDownloader({
  requestBinary,
  timeoutMs = 30000,
  maxAttempts = 2,
}) {
  if (typeof requestBinary !== "function") {
    throw new TypeError("requestBinary must be a function.");
  }

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError("timeoutMs must be a positive integer.");
  }

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError("maxAttempts must be a positive integer.");
  }

  return Object.freeze({
    async download(mediaItem) {
      assertMediaUrl(mediaItem?.url);
      let lastError;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const response = await requestBinary({
            url: mediaItem.url,
            timeoutMs,
          });

          if (response.status < 200 || response.status >= 300) {
            const error = new MediaDownloadError(
              "Media request returned HTTP " + response.status + ".",
              "HTTP_ERROR",
            );
            error.status = response.status;

            if (isTransientStatus(response.status) && attempt < maxAttempts) {
              lastError = error;
              continue;
            }

            throw error;
          }

          const declaredMimeType = response.headers?.["content-type"] ?? "";
          const blob = normalizeBody(response.body, declaredMimeType);
          let validated;
          try {
            validated = await validateMediaBlob({
              blob,
              expectedMediaType: mediaItem.type,
              declaredMimeType,
            });
          } catch (error) {
            throw new MediaDownloadError(
              "Downloaded media failed content validation.",
              "INVALID_MEDIA",
              { cause: error },
            );
          }

          return Object.freeze({
            ...validated,
            sourceUrl: mediaItem.url,
            finalUrl: response.finalUrl || mediaItem.url,
            status: response.status,
          });
        } catch (error) {
          if (error instanceof MediaDownloadError) {
            throw error;
          }

          lastError = new MediaDownloadError(
            "Media network request failed.",
            "NETWORK_ERROR",
            { cause: error },
          );

          if (attempt === maxAttempts) {
            throw lastError;
          }
        }
      }

      throw lastError;
    },
  });
}
