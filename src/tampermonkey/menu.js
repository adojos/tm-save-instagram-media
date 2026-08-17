export function createTampermonkeyMenuAdapter(registerMenuCommand) {
  if (typeof registerMenuCommand !== "function") {
    return Object.freeze({
      available: false,
      register() {
        return undefined;
      },
    });
  }

  return Object.freeze({
    available: true,
    register(label, handler) {
      if (typeof label !== "string" || label.trim() === "") {
        throw new TypeError("Menu command label must be non-empty.");
      }

      if (typeof handler !== "function") {
        throw new TypeError("Menu command handler must be a function.");
      }

      return registerMenuCommand(label, handler);
    },
  });
}
