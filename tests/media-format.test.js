import assert from "node:assert/strict";
import test from "node:test";

import { validateMediaBlob } from "../src/network/media-format.js";

const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const MP4_BYTES = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x00, 0x00,
]);

test("validates JPEG by signature and derives jpg extension", async () => {
  const result = await validateMediaBlob({
    blob: new Blob([JPEG_BYTES]),
    expectedMediaType: "image",
    declaredMimeType: "application/octet-stream",
  });

  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(result.extension, "jpg");
  assert.equal(result.blob.type, "image/jpeg");
});

test("validates MP4 by signature", async () => {
  const result = await validateMediaBlob({
    blob: new Blob([MP4_BYTES], { type: "video/mp4" }),
    expectedMediaType: "video",
  });

  assert.equal(result.mimeType, "video/mp4");
  assert.equal(result.extension, "mp4");
});

test("rejects declared MIME that conflicts with binary signature", async () => {
  await assert.rejects(
    validateMediaBlob({
      blob: new Blob([MP4_BYTES]),
      expectedMediaType: "video",
      declaredMimeType: "image/jpeg",
    }),
    /signature conflicts/u,
  );
});

test("rejects a model media type mismatch and unknown binary data", async () => {
  await assert.rejects(
    validateMediaBlob({
      blob: new Blob([JPEG_BYTES]),
      expectedMediaType: "video",
      declaredMimeType: "image/jpeg",
    }),
    /does not match/u,
  );
  await assert.rejects(
    validateMediaBlob({
      blob: new Blob([Uint8Array.from([1, 2, 3, 4])]),
      expectedMediaType: "image",
      declaredMimeType: "image/jpeg",
    }),
    /unsupported or unverified/u,
  );
});
