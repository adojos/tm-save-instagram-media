import { createMediaItem } from "../model/capture-item.js";

export class CarouselTraversalError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "CarouselTraversalError";
    this.code = code;
  }
}

function assertState(state) {
  if (
    !state ||
    typeof state.identity !== "string" ||
    state.identity === "" ||
    !state.media
  ) {
    throw new CarouselTraversalError(
      "The current carousel slide could not be identified safely.",
      "INVALID_STATE",
    );
  }
}

async function restoreOriginalPosition({ driver, state, originalIdentity, maxSlides }) {
  let current = state;

  for (let step = 0; step < maxSlides; step += 1) {
    if (current.identity === originalIdentity) {
      return true;
    }

    if (!current.canPrevious) {
      return false;
    }

    current = await driver.previous(current.identity);
    assertState(current);
  }

  return false;
}

export async function traverseCarousel({
  driver,
  maxSlides = 50,
  restorePosition = true,
}) {
  if (
    !driver ||
    typeof driver.read !== "function" ||
    typeof driver.previous !== "function" ||
    typeof driver.next !== "function"
  ) {
    throw new TypeError("A carousel driver is required.");
  }

  if (!Number.isInteger(maxSlides) || maxSlides < 1) {
    throw new TypeError("maxSlides must be a positive integer.");
  }

  let state = await driver.read();
  assertState(state);
  const originalIdentity = state.identity;
  const rewindSeen = new Set();

  for (let step = 0; state.canPrevious; step += 1) {
    if (step >= maxSlides || rewindSeen.has(state.identity)) {
      throw new CarouselTraversalError(
        "Carousel rewind exceeded its safety limit or entered a loop.",
        "REWIND_LOOP",
      );
    }

    rewindSeen.add(state.identity);
    const previousIdentity = state.identity;
    state = await driver.previous(previousIdentity);
    assertState(state);

    if (state.identity === previousIdentity) {
      throw new CarouselTraversalError(
        "Carousel did not change after selecting Previous.",
        "PREVIOUS_STALLED",
      );
    }
  }

  const discovered = [];
  const forwardSeen = new Set();

  for (let sequence = 1; sequence <= maxSlides; sequence += 1) {
    if (forwardSeen.has(state.identity)) {
      throw new CarouselTraversalError(
        "Carousel traversal encountered a previously visited slide.",
        "FORWARD_LOOP",
      );
    }

    forwardSeen.add(state.identity);
    discovered.push(createMediaItem({
      sequence,
      type: state.media.type,
      role: "primary",
      url: state.media.url,
      width: state.media.width,
      height: state.media.height,
    }));

    if (!state.canNext) {
      break;
    }

    if (sequence === maxSlides) {
      throw new CarouselTraversalError(
        "Carousel exceeded the configured slide safety limit.",
        "MAX_SLIDES",
      );
    }

    const previousIdentity = state.identity;
    state = await driver.next(previousIdentity);
    assertState(state);

    if (state.identity === previousIdentity) {
      throw new CarouselTraversalError(
        "Carousel did not change after selecting Next.",
        "NEXT_STALLED",
      );
    }
  }

  const originalPositionRestored = restorePosition
    ? await restoreOriginalPosition({
      driver,
      state,
      originalIdentity,
      maxSlides,
    })
    : false;

  return Object.freeze({
    media: Object.freeze(discovered),
    originalPositionRestored,
  });
}
