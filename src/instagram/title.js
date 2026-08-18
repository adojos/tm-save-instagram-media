const DEFAULT_MAX_TITLE_LENGTH = 100;

function normalizeCandidate(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/gu, " ").trim();
}

function truncateAtWordBoundary(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  const shortened = value.slice(0, maxLength + 1);
  const lastSpace = shortened.lastIndexOf(" ");
  const boundary = lastSpace >= Math.floor(maxLength * 0.6)
    ? lastSpace
    : maxLength;

  return shortened.slice(0, boundary).trimEnd();
}

export function deriveProposedTitle({
  heading,
  caption,
  author,
  postId,
  maxLength = DEFAULT_MAX_TITLE_LENGTH,
}) {
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new TypeError("maxLength must be a positive integer.");
  }

  if (typeof postId !== "string" || !/^[A-Za-z0-9_-]+$/u.test(postId)) {
    throw new TypeError("postId must be a canonical Instagram ID.");
  }

  const normalizedHeading = normalizeCandidate(heading);
  const firstCaptionLine = typeof caption === "string"
    ? normalizeCandidate(caption.split(/\r?\n/u).find((line) => line.trim()))
    : "";
  const fallbackAuthor = normalizeCandidate(author) || "Unknown author";
  const candidate = normalizedHeading || firstCaptionLine ||
    "Instagram - " + fallbackAuthor + " - " + postId;

  return truncateAtWordBoundary(candidate, maxLength);
}
