# Source layout

The source tree is organized by architectural responsibility. Only modules
that are implemented and safe to execute are imported by the userscript
entry point.

- app: application lifecycle and orchestration
- instagram: page detection and extraction
- model: normalized capture-domain objects
- network: portable downloader contract and Tampermonkey adapter
- filesystem: File System Access API wrapper and vault management
- storage: Obsidian, download-only, and capture-state workflows
- markdown: pure Markdown generation
- settings: versioned preferences and IndexedDB persistence
- ui: isolated in-page components
- runtime: capability detection
- tampermonkey: userscript-specific adapters
- utils: portable helpers

Unimplemented components remain disconnected from bootstrap. This prevents
partially built capture behavior from writing files or modifying the page.
