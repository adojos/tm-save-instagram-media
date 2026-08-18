import assert from "node:assert/strict";
import test from "node:test";

import {
  createTampermonkeyBinaryRequest,
  parseResponseHeaders,
} from "../src/network/tampermonkey-network.js";

test("response headers are normalized case-insensitively", () => {
  assert.deepEqual(
    parseResponseHeaders("Content-Type: image/jpeg\r\nX-Test: one\r\nX-Test: two"),
    {
      "content-type": "image/jpeg",
      "x-test": "one, two",
    },
  );
});

test("Tampermonkey adapter requests a Blob with timeout and normalizes response", async () => {
  let options;
  const body = new Blob([Uint8Array.from([0xff, 0xd8, 0xff])]);
  const request = createTampermonkeyBinaryRequest((requestOptions) => {
    options = requestOptions;
    requestOptions.onload({
      status: 200,
      statusText: "OK",
      responseHeaders: "Content-Type: image/jpeg",
      response: body,
      finalUrl: "https://cdn.example/final.jpg",
    });
  });

  const response = await request({
    url: "https://cdn.example/source.jpg",
    timeoutMs: 12000,
  });

  assert.equal(options.method, "GET");
  assert.equal(options.responseType, "blob");
  assert.equal(options.timeout, 12000);
  assert.equal(response.headers["content-type"], "image/jpeg");
  assert.equal(response.body, body);
  assert.equal(response.finalUrl, "https://cdn.example/final.jpg");
});

test("Tampermonkey adapter rejects timeout explicitly", async () => {
  const request = createTampermonkeyBinaryRequest((options) => {
    options.ontimeout();
  });

  await assert.rejects(
    request({ url: "https://cdn.example/media", timeoutMs: 1 }),
    /timed out/u,
  );
});
