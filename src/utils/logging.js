const LEVELS = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
});

export function createLogger({
  name = "InstagramCapture",
  level = "info",
  consoleObject = console,
} = {}) {
  if (!(level in LEVELS)) {
    throw new TypeError("Unknown log level: " + level);
  }

  const threshold = LEVELS[level];
  const logger = {};

  for (const [method, priority] of Object.entries(LEVELS)) {
    logger[method] = (...args) => {
      if (priority < threshold) {
        return;
      }

      const sink = consoleObject[method] ?? consoleObject.log;
      sink.call(consoleObject, "[" + name + "]", ...args);
    };
  }

  return Object.freeze(logger);
}
