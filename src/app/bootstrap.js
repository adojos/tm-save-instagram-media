import { ApplicationController } from "./controller.js";
import { APP_CONFIG } from "../config.js";
import { createTampermonkeyMenuAdapter } from "../tampermonkey/menu.js";
import { createLogger } from "../utils/logging.js";

export function bootstrap({
  globalScope = globalThis,
  gmRequest,
  gmRegisterMenuCommand,
} = {}) {
  const logger = createLogger({ name: APP_CONFIG.name });
  const menu = createTampermonkeyMenuAdapter(gmRegisterMenuCommand);
  const controller = new ApplicationController({
    globalScope,
    logger,
    menu,
    gmRequest,
  });

  controller.initialise();
  return controller;
}
