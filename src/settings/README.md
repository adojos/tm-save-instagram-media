# Settings

This component manages versioned application preferences and IndexedDB
persistence. The vault handle, vault-root confirmation, resolved Instagram
media path, and last note destination remain separate state. A v1 setting is
migrated with an unresolved media path so v1.1 discovery can apply safely.
