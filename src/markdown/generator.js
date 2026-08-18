function yamlString(value) {
  return JSON.stringify(String(value));
}

function safeHeading(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError("Markdown title must be non-empty.");
  }
  return value.replace(/[\r\n]+/gu, " ").trim();
}

function validateEmbedPath(path) {
  if (
    typeof path !== "string" ||
    path.trim() === "" ||
    /[\r\n]/u.test(path) ||
    path.includes("[[") ||
    path.includes("]]" )
  ) {
    throw new TypeError("Media embed path is unsafe.");
  }
  return path.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
}

export function generateObsidianMarkdown({ captureItem, title, mediaPaths }) {
  if (!captureItem || !Array.isArray(captureItem.media)) {
    throw new TypeError("A CaptureItem is required.");
  }
  if (!Array.isArray(mediaPaths) || mediaPaths.length !== captureItem.media.length) {
    throw new TypeError("Media paths must correspond one-to-one with media items.");
  }

  const heading = safeHeading(title);
  const embeds = mediaPaths.map(validateEmbedPath);
  const sourceKind = captureItem.contentType === "reel" ? "reel" : "post";
  const lines = [
    "---",
    "source: instagram",
    "content_type: " + yamlString(captureItem.contentType),
    "instagram_id: " + yamlString(captureItem.postId),
    "author: " + yamlString(captureItem.author),
    "url: " + yamlString(captureItem.canonicalUrl),
    "captured: " + yamlString(captureItem.capturedAt),
    "media_count: " + captureItem.mediaCount,
    "---",
    "",
    "# " + heading,
    "",
    "## Source",
    "",
    "Instagram " + sourceKind + " by @" + captureItem.author,
    "",
    captureItem.canonicalUrl,
    "",
    "## Caption",
    "",
    captureItem.caption,
    "",
    "## Media",
    "",
  ];

  for (const path of embeds) {
    lines.push("![[" + path + "]]", "");
  }

  return lines.join("\n").trimEnd() + "\n";
}
