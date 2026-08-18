import assert from "node:assert/strict";
import test from "node:test";

import {
  createMediaDownloader,
  MediaDownloadError,
} from "../src/network/downloader.js";

const JPEG_BODY = new Blob([
  Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
]);

test("downloader returns validated binary metadata", async () => {
  const downloader = createMediaDownloader({
    requestBinary: async () => ({
      status: 200,
      headers: { "content-type": "image/jpeg" },
      body: JPEG_BODY,
      finalUrl: "https://cdn.example/final.jpg",
    }),
  });
  const result = await downloader.download({
    type: "image",
    url: "https://cdn.example/source",
  });

  assert.equal(result.extension, "jpg");
  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(result.finalUrl, "https://cdn.example/final.jpg");
});

test("downloader retries a transient HTTP response once", async () => {
  let attempts = 0;
  const downloader = createMediaDownloader({
    maxAttempts: 2,
    requestBinary: async () => {
      attempts += 1;
      return attempts === 1
        ? { status: 503, headers: {}, body: new Blob([]) }
        : {
          status: 200,
          headers: { "content-type": "image/jpeg" },
          body: JPEG_BODY,
        };
    },
  });

  await downloader.download({ type: "image", url: "https://cdn.example/x" });
  assert.equal(attempts, 2);
});

test("downloader does not retry a permanent HTTP error", async () => {
  let attempts = 0;
  const downloader = createMediaDownloader({
    requestBinary: async () => {
      attempts += 1;
      return { status: 404, headers: {}, body: new Blob([]) };
    },
  });

  await assert.rejects(
    downloader.download({ type: "image", url: "https://cdn.example/x" }),
    (error) =>
      error instanceof MediaDownloadError &&
      error.code === "HTTP_ERROR" &&
      error.status === 404,
  );
  assert.equal(attempts, 1);
});

test("downloader reports content validation separately from network failure", async () => {
  const downloader = createMediaDownloader({
    requestBinary: async () => ({
      status: 200,
      headers: { "content-type": "text/html" },
      body: new Blob(["login page"], { type: "text/html" }),
    }),
  });

  await assert.rejects(
    downloader.download({ type: "image", url: "https://cdn.example/x" }),
    (error) =>
      error instanceof MediaDownloadError &&
      error.code === "INVALID_MEDIA",
  );
});
