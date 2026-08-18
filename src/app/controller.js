import { APP_CONFIG } from "../config.js";
import {
  detectRuntimeCapabilities,
  flattenCapabilityReport,
} from "../runtime/capabilities.js";
import { detectInstagramItemRoute } from "../instagram/item-route.js";
import { extractInstagramMetadata } from "../instagram/metadata.js";
import {
  classifyMediaProbe,
  collectInstagramMediaProbe,
} from "../instagram/media-probe.js";

export class ApplicationController {
  #globalScope;
  #logger;
  #menu;
  #gmRequest;
  #initialised = false;

  constructor({
    globalScope = globalThis,
    logger,
    menu,
    gmRequest,
  }) {
    this.#globalScope = globalScope;
    this.#logger = logger;
    this.#menu = menu;
    this.#gmRequest = gmRequest;
  }

  initialise() {
    if (this.#initialised) {
      return;
    }

    const capabilities = this.getCapabilities();

    this.#menu.register(
      APP_CONFIG.name + ": Runtime diagnostics",
      () => this.reportCapabilities(),
    );

    this.#menu.register(
      APP_CONFIG.name + ": Inspect current item",
      () => this.inspectCurrentItem(),
    );

    this.#logger.info(
      APP_CONFIG.name + " " + APP_CONFIG.version + " initialised.",
    );

    if (!capabilities.readyForFilesystemCapture) {
      this.#logger.warn(
        "Filesystem capture prerequisites are not all available.",
        flattenCapabilityReport(capabilities),
      );
    }

    if (!capabilities.readyForMediaDownload) {
      this.#logger.warn(
        "Tampermonkey media download API is unavailable.",
      );
    }

    this.#initialised = true;
  }

  getCapabilities() {
    return detectRuntimeCapabilities({
      globalScope: this.#globalScope,
      gmRequest: this.#gmRequest,
      gmRegisterMenuCommand: this.#menu.available
        ? this.#menu.register
        : undefined,
    });
  }

  reportCapabilities() {
    const report = flattenCapabilityReport(this.getCapabilities());
    this.#logger.info("Runtime capability report", report);

    if (typeof console.table === "function") {
      console.table(report);
    }

    return report;
  }

  inspectCurrentItem() {
    const itemRoute = detectInstagramItemRoute(
      this.#globalScope?.location?.href,
    );

    if (!itemRoute) {
      this.#logger.warn(
        "The current page is not a supported Instagram post or reel permalink.",
      );
      return null;
    }

    this.#logger.info("Current Instagram item", itemRoute);

    const metadata = extractInstagramMetadata({
      documentObject: this.#globalScope?.document,
      itemRoute,
    });

    const mediaProbe = collectInstagramMediaProbe(
      this.#globalScope?.document,
      {
        width: this.#globalScope?.innerWidth,
        height: this.#globalScope?.innerHeight,
      },
    );
    const classification = classifyMediaProbe({ itemRoute, probe: mediaProbe });

    this.#logger.info("Current Instagram metadata", metadata);
    this.#logger.info("Current Instagram media probe", {
      classification,
      mediaProbe,
    });

    if (typeof console.table === "function") {
      console.table({
        routeKind: itemRoute.routeKind,
        postId: metadata.postId,
        canonicalUrl: metadata.canonicalUrl,
        author: metadata.author || "(unavailable)",
        caption: metadata.caption || "(unavailable)",
        proposedTitle: metadata.proposedTitle,
        authorSource: metadata.sources.author,
        captionSource: metadata.sources.caption,
        detectedContentType: classification.contentType,
        classificationConfidence: classification.confidence,
        mediaCandidates: mediaProbe.candidates.length,
        substantialCandidates: classification.substantialCandidateCount,
        probeRegion: mediaProbe.regionKind,
        carouselControls: mediaProbe.carouselControlLabels.join(", ") ||
          "(none)",
      });

      console.table(mediaProbe.candidates.map((candidate) => ({
        index: candidate.index,
        type: candidate.mediaType,
        intrinsic: candidate.intrinsicWidth + "x" + candidate.intrinsicHeight,
        rendered: candidate.renderedWidth + "x" + candidate.renderedHeight,
        visible: candidate.visible,
        inViewport: candidate.inViewport,
        substantial: candidate.substantial,
        hasSource: Boolean(candidate.source),
        sourceKey: candidate.sourceFingerprint,
        hasPoster: Boolean(candidate.poster),
        alt: candidate.alt.slice(0, 80),
      })));
    }

    return Object.freeze({ itemRoute, metadata, mediaProbe, classification });
  }
}
