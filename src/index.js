import { bootstrap } from "./app/bootstrap.js";

const gmRequest =
  typeof GM_xmlhttpRequest === "function"
    ? GM_xmlhttpRequest
    : undefined;

const gmRegisterMenuCommand =
  typeof GM_registerMenuCommand === "function"
    ? GM_registerMenuCommand
    : undefined;

bootstrap({
  globalScope: globalThis,
  gmRequest,
  gmRegisterMenuCommand,
});
