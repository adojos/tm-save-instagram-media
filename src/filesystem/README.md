# Filesystem

This component wraps the File System Access API, permission checks, safe path
traversal, non-overwriting writes, directory listing, and Mode B numbered
directory allocation. `vault-manager.js` restores or configures the vault root
through the settings boundary. Operations remain handle-based and stay beneath
user-authorized roots.
