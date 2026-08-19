# Instagram Media Capture for Tampermonkey — Architecture

## 1. Architectural Goal

The application shall separate Instagram-specific extraction logic from storage and presentation logic.

The initial runtime is Tampermonkey, but the architecture shall support later migration to a Chrome/Chromium browser extension.

The preferred model is:

    Instagram Page
          |
          v
    Capture Controller
          |
     +----+----+
     |         |
     v         v
 Instagram   UI Layer
 Extractor
     |
     v
 Normalised Capture Model
     |
     +------------------------+
     |                        |
     v                        v
 Obsidian Storage       Filesystem Storage
 Adapter                Adapter
     |                        |
     v                        v
 Markdown + Media          Media Only

---

# 2. Major Components

## 2.1 Application Controller

Responsibilities:

- initialise application
- detect page changes
- determine whether capture action should be available
- orchestrate extraction
- invoke UI
- select storage strategy
- manage high-level errors
- report progress

The controller must not directly implement Instagram DOM parsing or filesystem operations.

---

## 2.2 Instagram Content Detector

Responsibilities:

Determine whether the active Instagram item is:

- single image
- carousel
- reel
- unsupported

Proposed normalised result:

    {
      contentType: "carousel",
      postId: "DTGNAC9E1jI"
    }

Instagram-specific selector logic should live here or in closely related extraction modules.

---

## 2.3 Instagram Metadata Extractor

Responsibilities:

Extract, where available:

- post ID
- canonical URL
- username/author
- caption
- possible title text
- media count
- content type
- relevant post metadata

It shall return structured data independent of the storage destination.

---

## 2.4 Instagram Media Extractor

Responsibilities:

Discover media entries.

Normalised result example:

    [
      {
        sequence: 1,
        type: "image",
        role: "primary",
        url: "...",
        width: 1080,
        height: 1350
      },
      {
        sequence: 2,
        type: "video",
        role: "primary",
        url: "..."
      }
    ]

For reels:

    [
      {
        sequence: 1,
        type: "video",
        role: "primary",
        url: "..."
      },
      {
        type: "image",
        role: "auxiliary",
        purpose: "cover",
        url: "..."
      }
    ]

The extractor should prefer the best practical media URL rather than screenshots.

---

# 3. Capture Model

All Instagram-specific extraction shall be normalised before storage.

Recommended conceptual structure:

    CaptureItem {
        source
        contentType
        postId
        canonicalUrl
        author
        caption
        proposedTitle
        capturedAt
        media[]
    }

Example:

    {
      "source": "instagram",
      "contentType": "carousel",
      "postId": "DTGNAC9E1jI",
      "canonicalUrl": "https://www.instagram.com/p/DTGNAC9E1jI/",
      "author": "innovation",
      "caption": "...",
      "proposedTitle": "Elite Mastery Roadmap",
      "capturedAt": "...",
      "media": [...]
    }

Storage code must consume this model instead of scraping the page itself.

`media_count` is derived from media entries whose role is `primary`. Auxiliary media such as a reel cover remains represented in `media[]` but does not increase the count.

---

# 4. Media Download Service

Responsibilities:

- retrieve media from discovered URLs
- return binary Blob/data
- enforce timeout
- detect HTTP errors
- determine MIME type
- derive extension
- optionally retry transient failures

For Tampermonkey, network requests may use a Tampermonkey-specific implementation.

Expose the downloader through an interface conceptually equivalent to:

    download(url) -> Blob

This allows later replacement by extension-native fetch/network mechanisms.

---

# 5. Storage Strategy

Define a common storage abstraction.

Conceptual interface:

    StorageProvider {
        save(captureItem, options)
    }

Implementations:

    ObsidianStorageProvider
    DownloadStorageProvider

---

# 6. Obsidian Storage Provider

Responsibilities:

1. obtain configured vault access
2. resolve the persisted or discovered vault-relative Instagram media root
3. detect completed captures by canonical Post ID
4. obtain a note destination through the vault-relative folder browser only when a new capture requires one
5. create or recover the post-specific media directory
6. maintain capture-state markers
7. write required primary and available auxiliary media
8. generate Markdown
9. write Markdown
10. commit the complete capture marker

The provider must not contain Instagram scraping logic.

---

# 7. Download Storage Provider

Responsibilities:

1. obtain a parent destination folder
2. create `<Sanitised Title> - <PostID>`
3. allocate the next numbered directory when that name exists
4. download/write media through the shared downloader
5. use deterministic meaningful filenames

It must not:

- create Markdown,
- assume an Obsidian vault,
- create the configured Obsidian Media hierarchy,
- generate YAML.

---

# 8. Filesystem Abstraction

Create a filesystem service around browser filesystem APIs.

Conceptual operations:

    chooseDirectory()
    getDirectory(parent, name, create)
    getFile(directory, name, create)
    fileExists(...)
    directoryExists(...)
    writeBlob(...)
    writeText(...)
    removeEntry(...)
    ensureWritePermission(...)
    queryPermission(...)

This prevents File System Access API calls from being distributed across unrelated modules.

---

# 9. Vault Manager

Responsibilities:

- configure vault root
- persist vault directory handle
- restore persisted handle
- validate permission
- request renewed permission
- provide the root handle to the vault-relative destination browser
- distinguish a confirmed vault root from an ordinary note subfolder
- reset configuration

Persistence:

    IndexedDB
        |
        +-- vault FileSystemDirectoryHandle
        +-- settings

The persisted vault root and last note destination must be treated as separate concepts.

The note destination UI traverses directory handles reachable from the vault root. The native filesystem directory picker is not the primary note-destination selector.

---

# 10. Settings Manager

Persist application preferences.

Proposed data:

    {
      schemaVersion: 2,
      instagramMediaPath: "Media/Instagram",
      lastMode: "obsidian",
      lastNoteRelativePath: "...",
      vaultRootConfirmed: true,
      debug: false
    }

The FileSystemDirectoryHandle may require separate IndexedDB storage depending on implementation details.

Settings shall be versioned to allow migration.

`instagramMediaPath` is a vault-relative path. An empty value means that the
media location must be resolved. A v1 setting is migrated to this unresolved
state so an obsolete fixed path is not reused silently.

---

# 11. Obsidian Media Hierarchy

Default when a first-level Media directory exists or the user creates it:

    <Vault Root>/
      Media/
        Instagram/
          <Title> - <PostID>/
            <PostID>-01.jpg
            <PostID>-02.mp4
            .capture-complete.json
            ...

Example:

    MyVault/
      Media/
        Instagram/
          Elite Mastery Roadmap - DTGNAC9E1jI/
            DTGNAC9E1jI-01.jpg
            DTGNAC9E1jI-02.jpg

The Markdown note may reside anywhere else inside the vault.

The post directory is located by canonical Post ID, not by assuming that its editable title remains unchanged.

Media-root resolution follows this order:

1. reuse a valid persisted vault-relative `instagramMediaPath`,
2. inspect the vault root's immediate children for `Media`
   case-insensitively,
3. if absent, ask whether to create root-level `Media` or choose another
   vault-relative parent,
4. create or reuse `Instagram` beneath the resolved `Media` directory,
5. persist the actual vault-relative path, including on-disk casing.

The resolver does not recursively search the vault. The application-owned
vault browser is used only when the user explicitly chooses a custom parent.

---

# 12. Markdown Generator

Input:

- CaptureItem
- resolved media paths
- selected title

Output:

- Markdown text

Responsibilities:

- YAML serialization
- safe Markdown formatting
- preserve caption
- generate local embeds
- include successfully downloaded reel covers as auxiliary embeds
- source section
- media section

The Markdown generator must not directly write files.

---

# 13. Link Strategy

Obsidian media shall use vault-local paths.

Generated note and media path components shall replace operating-system-invalid characters and Obsidian wikilink control characters, including `#`, `^`, `[`, and `]`, before links are generated.

Example:

    ![[Media/Instagram/Elite Mastery Roadmap - DTGNAC9E1jI/DTGNAC9E1jI-01.jpg]]

Do not use:

- Base64 image data
- temporary browser URLs
- Instagram CDN URLs as the primary embed mechanism
- `file:///` links

---

# 14. UI Architecture

The UI shall consist of a small isolated component layer.

Components may include:

    CaptureButton
    CaptureModal
    ProgressIndicator
    DestinationSummary
    DuplicateDialog
    RecoveryDialog
    VaultFolderBrowser
    SettingsDialog
    Notification/Toast

CSS should be scoped to avoid interfering with Instagram.

Prefer:

- namespaced classes
- Shadow DOM if practical

Avoid generic global selectors.

---

# 15. SPA Navigation

Instagram behaves as a Single Page Application.

The application shall detect navigation between posts without requiring a complete browser reload.

Possible mechanisms include:

- MutationObserver
- URL/path observation
- history-state monitoring

UI installation must be idempotent.

Do not create duplicate capture buttons after SPA navigation.

---

# 16. Carousel Extraction

Carousel extraction should:

1. identify current carousel
2. determine current media
3. navigate to the first slide if necessary
4. discover media sequentially
5. preserve sequence across image and video items
6. track already-seen media
7. stop at the end
8. guard against loops
9. tolerate lazy loading

Selectors should be centralised.

Preferred discovery hierarchy:

1. semantic accessibility attributes
2. known Instagram structural patterns
3. structured metadata
4. geometry-based fallback

---

# 17. Reel Extraction

Reel extraction shall remain a distinct extraction path.

Possible media:

- primary video with role `primary`
- optional cover image with role `auxiliary`

The resulting CaptureItem still uses the same generic media model.

The cover is best-effort. When downloaded it is embedded in Markdown and recorded in the complete marker, but it does not increment `media_count` and its failure does not fail the primary reel capture.

---

# 18. Duplicate Strategy

## Mode A canonical identity

The canonical Instagram Post ID is the unique managed-capture identity within a vault.

A valid `.capture-complete.json` in the matching managed post directory blocks another Mode A capture. The editable title is not part of identity.

The post directory should be found by its Post-ID suffix beneath the managed Instagram media root. An optional IndexedDB lookup may accelerate discovery but must not be the sole source of truth.

If more than one managed post directory matches the same Post ID, automatic capture stops with an ambiguous-state error.

---

## Mode A interrupted recovery

A valid `.capture-incomplete.json` without a complete marker identifies an interrupted attempt.

After user confirmation, recovery may overwrite only deterministic media targets owned by the matching Post ID. Each replacement must be downloaded successfully before its target is opened for writing. Unknown, unrelated and obsolete files are left untouched.

If a matching intended note already exists and its Post ID and local media references validate, recovery writes the complete marker instead of creating another note.

Ambiguous state, malformed markers and identity conflicts stop automatic recovery.

---

## Markdown filename

If a proposed Markdown filename is occupied by unrelated content, invoke duplicate resolution UI:

- Replace
- Create Copy
- Cancel

These options do not bypass the completed Post-ID duplicate block.

---

## Mode B directory

Mode B creates a dedicated per-item directory. On collision it allocates ` - 2`, ` - 3`, and subsequent numeric suffixes. It never overwrites an existing Mode B directory or file.

---

# 19. Transaction Behaviour

Mode A uses explicit vault-resident capture state.

1. extract all metadata
2. discover complete media list
3. validate vault access
4. resolve the persisted or discovered media root and locate the canonical Post ID
5. block if a valid complete marker already exists
6. resolve a new note destination only when required
7. create or validate `.capture-incomplete.json`
8. download/write required primary media and available auxiliary media
9. generate and write Markdown
10. write `.capture-complete.json`
11. remove the incomplete marker as best-effort cleanup

The complete marker is the authoritative positive completion signal. If both markers exist, complete wins and the stale incomplete marker may be removed.

If a directory has neither marker, its existence alone does not prove completion and does not authorize overwrite.

The complete marker contains at minimum the schema version, Post ID, vault-relative note path, actual media filenames and completion timestamp.

---

# 20. Logging

Introduce a lightweight logging service.

Levels:

- error
- warn
- info
- debug

Debug logging should be configurable.

Production behaviour should avoid excessive console noise.

---

# 21. Security Model

The application shall minimise filesystem permissions.

The user explicitly chooses:

- Obsidian vault root
- ordinary download destination

Do not attempt arbitrary filesystem traversal outside granted directory handles.

Do not store filesystem access state in Instagram cookies.

Do not transmit vault paths or captured content to external services.

---

# 22. Browser Compatibility

Primary:

    Chromium desktop with Tampermonkey

The application shall feature-detect:

    window.showDirectoryPicker

or equivalent File System Access capabilities.

Unsupported browser behaviour shall be explicit.

The v1 validation matrix covers the Tampermonkey userscript runtime only. Chrome-extension packaging, permissions and runtime validation belong to a separate future project.

---

# 23. Tampermonkey Integration Boundary

Tampermonkey-specific APIs should be isolated.

Potential adapters:

    TampermonkeyNetworkAdapter
    TampermonkeyMenuAdapter

Core code should remain portable.

This preserves the option for a separate future project targeting:

    Chrome Extension
        Manifest V3

---

# 24. Future Extension Migration

Chrome-extension work is outside the scope and validation obligations of this repository's v1 release.

The architecture should nevertheless allow:

    Instagram Extractors
          |
    Capture Model
          |
    Storage Providers
          |
    Markdown Generator

to move largely unchanged.

Likely replacement areas during extension migration:

    userscript metadata
    Tampermonkey menu API
    Tampermonkey cross-origin request API
    script injection/bootstrap
    settings storage implementation
    extension UI integration

---

# 25. Recommended Initial Module Layout

Even if eventually bundled into one userscript:

    src/
      app/
        controller.js

      instagram/
        detector.js
        metadata.js
        carousel.js
        reel.js
        image.js

      model/
        capture-item.js

      network/
        downloader.js
        tampermonkey-network.js

      filesystem/
        filesystem.js
        vault-manager.js

      storage/
        obsidian-storage.js
        download-storage.js
        capture-state.js

      markdown/
        generator.js

      settings/
        settings.js
        indexeddb.js

      ui/
        capture-button.js
        modal.js
        progress.js
        settings-dialog.js

      utils/
        filename.js
        paths.js
        logging.js

    build/
      instagram-media-capture.user.js

This structure is conceptual and may be adapted to the chosen build tooling.
