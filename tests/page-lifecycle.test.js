import assert from "node:assert/strict";
import test from "node:test";

import { createPageLifecycle } from "../src/app/page-lifecycle.js";

function createRuntime(href) {
  const listeners = new Map();
  const runtime = {
    location: { href },
    document: {
      documentElement: {},
      querySelectorAll() { return []; },
      querySelector() { return null; },
    },
    setTimeout,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  };
  return { runtime, listeners };
}

test("SPA lifecycle publishes supported and unsupported route transitions", async () => {
  const { runtime, listeners } = createRuntime("https://www.instagram.com/p/ABC123/");
  const states = [];
  const lifecycle = createPageLifecycle({
    globalScope: runtime,
    onAvailabilityChange(available, context) {
      states.push([available, context?.postId]);
    },
  });

  lifecycle.start();
  await new Promise((resolve) => setTimeout(resolve, 130));
  assert.deepEqual(states, [[true, "ABC123"]]);

  runtime.location.href = "https://www.instagram.com/explore/";
  listeners.get("popstate")();
  await new Promise((resolve) => setTimeout(resolve, 130));
  assert.deepEqual(states.at(-1), [false, undefined]);

  lifecycle.stop();
  assert.equal(listeners.has("popstate"), false);
});
