# Filesystem

This component wraps the File System Access API, permission checks, safe path
traversal, non-overwriting writes, directory listing, and Mode B numbered
directory allocation. `vault-manager.js` restores or configures the vault root
through the settings boundary. `media-root-manager.js` reuses a first-level
Media directory or creates one beneath an explicitly selected vault-relative
parent, then persists the resolved Instagram path. Operations remain
handle-based and stay beneath user-authorized roots.
