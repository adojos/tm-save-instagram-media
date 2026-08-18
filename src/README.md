# Source layout

The source tree is organized by architectural responsibility. Production
modules are imported through the userscript entry point and bundled into one
installable file.

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

Portable services are kept behind narrow adapters so Instagram extraction,
Tampermonkey networking, browser filesystem access, and storage transactions
can be tested independently.
