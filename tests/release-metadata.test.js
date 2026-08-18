import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { APP_CONFIG } from "../src/config.js";

test("userscript release metadata matches the application version and update target", async () => {
  const [metadata, packageJson] = await Promise.all([
    readFile(new URL("../src/userscript.meta.txt", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  assert.equal(APP_CONFIG.version, packageJson.version);
  assert.match(metadata, new RegExp("^// @version\\s+" + APP_CONFIG.version.replaceAll(".", "\\.") + "$", "mu"));
  assert.match(metadata, /^\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/adojos\/tm-save-instagram-media\/main\/release\/instagram-capture\.user\.js$/mu);
  assert.match(metadata, /^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/adojos\/tm-save-instagram-media\/main\/release\/instagram-capture\.user\.js$/mu);
});
