export const CONTENT_TYPES = Object.freeze([
  "image",
  "carousel",
  "reel",
]);

export const MEDIA_TYPES = Object.freeze(["image", "video"]);
export const MEDIA_ROLES = Object.freeze(["primary", "auxiliary"]);

function assertOneOf(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new TypeError(
      label + " must be one of: " + allowed.join(", ") + ".",
    );
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(label + " must be a non-empty string.");
  }
}

function assertWebUrl(value, label) {
  assertNonEmptyString(value, label);

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(label + " must be a valid URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new TypeError(label + " must use HTTP or HTTPS.");
  }
}

export function createMediaItem({
  sequence,
  type,
  role = "primary",
  purpose,
  url,
  width,
  height,
}) {
  assertOneOf(type, MEDIA_TYPES, "media type");
  assertOneOf(role, MEDIA_ROLES, "media role");
  assertWebUrl(url, "media URL");

  if (
    role === "primary" &&
    (!Number.isInteger(sequence) || sequence < 1)
  ) {
    throw new TypeError(
      "Primary media requires a positive integer sequence.",
    );
  }

  if (
    role === "auxiliary" &&
    sequence !== undefined &&
    (!Number.isInteger(sequence) || sequence < 1)
  ) {
    throw new TypeError(
      "Auxiliary media sequence must be a positive integer when set.",
    );
  }

  for (const [label, value] of [
    ["width", width],
    ["height", height],
  ]) {
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value < 1)
    ) {
      throw new TypeError(
        "Media " + label + " must be a positive integer when set.",
      );
    }
  }

  return Object.freeze({
    sequence,
    type,
    role,
    purpose: purpose ?? null,
    url,
    width: width ?? null,
    height: height ?? null,
  });
}

export function countPrimaryMedia(media) {
  return media.filter((item) => item.role === "primary").length;
}

function validatePrimaryMedia(contentType, primaryMedia) {
  if (primaryMedia.length < 1) {
    throw new TypeError(
      "A capture item requires at least one primary media item.",
    );
  }

  const sequences = primaryMedia.map((item) => item.sequence);
  const expectedSequences = primaryMedia.map((_, index) => index + 1);

  if (
    sequences.some(
      (sequence, index) => sequence !== expectedSequences[index],
    )
  ) {
    throw new TypeError(
      "Primary media sequence must start at 1 and remain contiguous.",
    );
  }

  if (
    contentType === "image" &&
    (primaryMedia.length !== 1 || primaryMedia[0].type !== "image")
  ) {
    throw new TypeError(
      "Single-image captures require exactly one primary image.",
    );
  }

  if (
    contentType === "reel" &&
    (primaryMedia.length !== 1 || primaryMedia[0].type !== "video")
  ) {
    throw new TypeError(
      "Reel captures require exactly one primary video.",
    );
  }
}

export function createCaptureItem({
  source = "instagram",
  contentType,
  postId,
  canonicalUrl,
  author,
  caption = "",
  proposedTitle,
  capturedAt,
  media,
}) {
  if (source !== "instagram") {
    throw new TypeError("source must be instagram.");
  }

  assertOneOf(contentType, CONTENT_TYPES, "content type");
  assertNonEmptyString(postId, "postId");
  if (!/^[A-Za-z0-9_-]+$/u.test(postId)) {
    throw new TypeError("postId must be a canonical Instagram ID.");
  }
  assertWebUrl(canonicalUrl, "canonicalUrl");
  assertNonEmptyString(author, "author");
  assertNonEmptyString(proposedTitle, "proposedTitle");
  assertNonEmptyString(capturedAt, "capturedAt");

  if (Number.isNaN(Date.parse(capturedAt))) {
    throw new TypeError("capturedAt must be an ISO-compatible timestamp.");
  }

  if (typeof caption !== "string") {
    throw new TypeError("caption must be a string.");
  }

  if (!Array.isArray(media)) {
    throw new TypeError("media must be an array.");
  }

  const normalizedMedia = media.map((item) =>
    Object.isFrozen(item) ? item : createMediaItem(item),
  );
  const primaryMedia = normalizedMedia.filter(
    (item) => item.role === "primary",
  );

  validatePrimaryMedia(contentType, primaryMedia);

  return Object.freeze({
    source,
    contentType,
    postId,
    canonicalUrl,
    author,
    caption,
    proposedTitle,
    capturedAt,
    media: Object.freeze(normalizedMedia),
    mediaCount: primaryMedia.length,
  });
}
