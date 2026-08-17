const FILESYSTEM_UNSAFE =
  /[<>:"/\\|?*\u0000-\u001f\u007f]+/gu;
const OBSIDIAN_LINK_UNSAFE = /[#\^\[\]]+/gu;
const ANY_UNSAFE_REPLACEMENT =
  /[<>:"/\\|?*#\^\[\]\u0000-\u001f\u007f]/u;
const WINDOWS_RESERVED_NAME =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

function escapeRegExp(value) {
  return value.replace(/[/\\^$*+?.()|[\]{}]/gu, "\\$&");
}

function assertLength(maxLength) {
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new RangeError("maxLength must be a positive integer.");
  }
}

function trimUnsafeEdges(value, replacement) {
  const escapedReplacement = escapeRegExp(replacement);
  return value
    .trim()
    .replace(/[. ]+$/gu, "")
    .replace(
      new RegExp(
        "^(?:" +
          escapedReplacement +
          "\\s*)+|(?:\\s*" +
          escapedReplacement +
          ")+$",
        "gu",
      ),
      "",
    )
    .trim()
    .replace(/[. ]+$/gu, "");
}

export function sanitizePathComponent(
  input,
  {
    fallback = "Instagram",
    maxLength = 120,
    replacement = "-",
  } = {},
) {
  assertLength(maxLength);

  if (
    typeof replacement !== "string" ||
    replacement.length !== 1 ||
    ANY_UNSAFE_REPLACEMENT.test(replacement)
  ) {
    throw new TypeError(
      "replacement must be one filesystem-safe character.",
    );
  }

  let value = String(input ?? "")
    .normalize("NFC")
    .replace(FILESYSTEM_UNSAFE, " " + replacement + " ")
    .replace(OBSIDIAN_LINK_UNSAFE, " " + replacement + " ")
    .replace(/\s+/gu, " ");

  const repeatedReplacement = new RegExp(
    "(?:\\s*" + escapeRegExp(replacement) + "\\s*){2,}",
    "gu",
  );

  value = trimUnsafeEdges(
    value.replace(repeatedReplacement, " " + replacement + " "),
    replacement,
  );

  if (value.length > maxLength) {
    value = trimUnsafeEdges(value.slice(0, maxLength), replacement);
  }

  if (value === "") {
    value = String(fallback ?? "")
      .normalize("NFC")
      .replace(FILESYSTEM_UNSAFE, " " + replacement + " ")
      .replace(OBSIDIAN_LINK_UNSAFE, " " + replacement + " ")
      .replace(/\s+/gu, " ")
      .replace(repeatedReplacement, " " + replacement + " ");
    value = trimUnsafeEdges(value.slice(0, maxLength), replacement);
  }

  if (WINDOWS_RESERVED_NAME.test(value)) {
    const reservedSuffix = replacement + "item";
    value = trimUnsafeEdges(
      value.slice(0, Math.max(1, maxLength - reservedSuffix.length)) +
        reservedSuffix,
      replacement,
    );
  }

  return value || "Instagram".slice(0, maxLength);
}

export function buildItemDirectoryName(
  title,
  postId,
  { collisionNumber, maxLength = 160 } = {},
) {
  assertLength(maxLength);

  if (
    typeof postId !== "string" ||
    !/^[A-Za-z0-9_-]+$/u.test(postId)
  ) {
    throw new TypeError("postId must be a canonical Instagram ID.");
  }

  if (
    collisionNumber !== undefined &&
    (!Number.isInteger(collisionNumber) || collisionNumber < 2)
  ) {
    throw new RangeError(
      "collisionNumber must be an integer greater than or equal to 2.",
    );
  }

  const collisionSuffix =
    collisionNumber === undefined ? "" : " - " + collisionNumber;
  const identitySuffix = " - " + postId + collisionSuffix;
  const titleBudget = maxLength - identitySuffix.length;

  if (titleBudget < 1) {
    throw new RangeError(
      "maxLength is too small to preserve the canonical Post ID.",
    );
  }

  const safeTitle = sanitizePathComponent(title, {
    fallback: "Instagram",
    maxLength: titleBudget,
  });

  return safeTitle + identitySuffix;
}

export function buildNoteFilename(title, { maxLength = 160 } = {}) {
  const extension = ".md";
  assertLength(maxLength);

  if (maxLength <= extension.length) {
    throw new RangeError("maxLength is too small for a Markdown file.");
  }

  const titleWithoutExtension = String(title ?? "").replace(
    /\.md\s*$/iu,
    "",
  );

  return (
    sanitizePathComponent(titleWithoutExtension, {
      fallback: "Instagram",
      maxLength: maxLength - extension.length,
    }) + extension
  );
}
