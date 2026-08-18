import { copyFile, mkdir, readFile } from "node:fs/promises";
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");
const metadata = await readFile(
  new URL("../src/userscript.meta.txt", import.meta.url),
  "utf8",
);

const options = {
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  outfile: "dist/instagram-capture.user.js",
  banner: { js: metadata.trimEnd() },
  charset: "utf8",
  legalComments: "none",
  logLevel: "info",
  sourcemap: false,
};

if (watch) {
  const buildContext = await context(options);
  await buildContext.watch();
  console.info("Watching Tampermonkey userscript sources...");
} else {
  await build(options);
  await mkdir("release", { recursive: true });
  await copyFile(options.outfile, "release/instagram-capture.user.js");
  console.info("Release userscript written to release/instagram-capture.user.js");
}
