export class StorageError extends Error {
  constructor(message, code, options) {
    super(message, options);
    this.name = "StorageError";
    this.code = code;
  }
}
