export function parseResponseHeaders(rawHeaders = "") {
  const headers = {};

  for (const line of rawHeaders.split(/\r?\n/u)) {
    const separator = line.indexOf(":");
    if (separator < 1) {
      continue;
    }

    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    headers[name] = headers[name]
      ? headers[name] + ", " + value
      : value;
  }

  return Object.freeze(headers);
}

export function createTampermonkeyBinaryRequest(gmRequest) {
  if (typeof gmRequest !== "function") {
    throw new TypeError("GM_xmlhttpRequest is required.");
  }

  return function requestBinary({ url, timeoutMs }) {
    return new Promise((resolve, reject) => {
      gmRequest({
        method: "GET",
        url,
        responseType: "blob",
        timeout: timeoutMs,
        onload(response) {
          resolve(Object.freeze({
            status: response.status,
            statusText: response.statusText ?? "",
            headers: parseResponseHeaders(response.responseHeaders),
            body: response.response,
            finalUrl: response.finalUrl || url,
          }));
        },
        onerror() {
          reject(new Error("Tampermonkey network request failed."));
        },
        ontimeout() {
          reject(new Error("Tampermonkey network request timed out."));
        },
        onabort() {
          reject(new Error("Tampermonkey network request was aborted."));
        },
      });
    });
  };
}
