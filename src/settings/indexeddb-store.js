export function createIndexedDbStore({
  indexedDB = globalThis.indexedDB,
  databaseName = "instagram-capture-utility",
  storeName = "configuration",
  version = 1,
} = {}) {
  if (!indexedDB || typeof indexedDB.open !== "function") {
    throw new Error("IndexedDB is unavailable.");
  }

  let databasePromise;

  function openDatabase() {
    databasePromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, version);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked."));
    });
    return databasePromise;
  }

  async function run(mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let request;
      let result;
      try {
        request = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(result);
    });
  }

  return Object.freeze({
    get(key) {
      return run("readonly", (store) => store.get(key));
    },
    async set(key, value) {
      await run("readwrite", (store) => store.put(value, key));
    },
    async delete(key) {
      await run("readwrite", (store) => store.delete(key));
    },
    async clear() {
      await run("readwrite", (store) => store.clear());
    },
  });
}

export function createMemoryStore(initialEntries = []) {
  const values = new Map(initialEntries);
  return Object.freeze({
    async get(key) {
      return values.get(key);
    },
    async set(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    },
    async clear() {
      values.clear();
    },
  });
}
