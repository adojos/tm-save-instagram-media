# Instagram Capture Utility — Requirements

## 1. Purpose

The application shall provide a fast, on-demand mechanism for capturing media and metadata from Instagram posts directly from the Instagram web interface.

The initial implementation shall be a Tampermonkey userscript.

The design shall allow later migration to a Chrome/Chromium browser extension without requiring a fundamental redesign of the capture or storage architecture.

---

# 2. Supported Instagram Content

The utility shall recognise at minimum:

1. single-image posts
2. carousel posts
3. reels

The visible action button should reflect the detected content type where practical.

Examples:

- Save Image
- Save Carousel
- Save Reel

---

# 3. Primary User Interaction

When viewing a supported Instagram item, the user shall be presented with a capture button.

Clicking the button shall open a custom application modal.

The modal shall not rely solely on browser-native `alert()`, `prompt()`, or `confirm()` dialogs.

The initial modal shall display, where available:

- content type
- Instagram author
- media count
- proposed title
- Save to Obsidian option

Example:

    Instagram Capture

    @innovation
    Carousel • 9 images

    [x] Save to Obsidian vault

    Note title:
    [ Elite Mastery Roadmap ]

    [ Cancel ] [ Continue ]

---

# 4. Storage Modes

## 4.1 Mode A — Save to Obsidian

Mode A is active when:

`Save to Obsidian vault = checked`

The utility shall:

1. obtain access to the configured Obsidian vault,
2. allow the user to choose the Markdown note destination,
3. determine or create the Instagram media location,
4. create a post-specific media directory,
5. download all required media,
6. create one Markdown note,
7. embed the downloaded media using local Obsidian links.

---

## 4.2 Mode B — Download Only

Mode B is active when:

`Save to Obsidian vault = unchecked`

The utility shall:

1. ask the user to choose an arbitrary parent filesystem directory,
2. create a per-item directory named `<Sanitised Title> - <PostID>`,
3. download the Instagram media into that directory,
4. use meaningful deterministic filenames.

If the per-item directory already exists, create the next available numbered directory:

    <Sanitised Title> - <PostID> - 2
    <Sanitised Title> - <PostID> - 3

Mode B shall never silently overwrite an existing directory or file.

Mode B shall not create:

- Markdown files,
- YAML,
- Obsidian-specific folders,
- Obsidian links.

---

# 5. Obsidian Vault Configuration

## 5.1 Vault selection

On the first Mode A operation, the user shall be asked to choose the root directory of the Obsidian vault.

Example:

    D:\Knowledge\MyVault

The application shall not require the user to select the vault again on every capture when a valid persisted handle exists.

---

## 5.2 Vault persistence

The vault directory shall be represented using a browser `FileSystemDirectoryHandle`.

Where supported, the handle shall be persisted using IndexedDB.

On subsequent use, the application shall:

1. retrieve the saved handle,
2. check filesystem permissions,
3. reuse it if permission remains valid,
4. request renewed permission if needed,
5. request vault selection again only if necessary.

Instagram cookies shall not be used for this purpose.

---

# 6. Note Destination

The location of the Markdown note shall be independent from the media storage location.

For each capture, the user shall be able to select the destination folder within the configured Obsidian vault.

The destination shall be selected through an application-owned vault-relative folder browser populated by traversing the cached vault directory handle. Only folders reachable beneath the vault root shall be presented.

Example:

    Vault/
      AI/
        Prompt Engineering/
          Elite Mastery Roadmap.md

The application may remember the last selected note destination as a convenience.

The cached note destination shall not replace or redefine the configured vault root.

---

# 7. Obsidian Media Storage

## 7.1 Default media root

The default Instagram media location shall be:

    media/Instagram/

relative to the Obsidian vault root.

If required directories do not exist, the application shall be capable of creating them.

---

## 7.2 Media root configuration

The design shall allow the media root to become configurable.

The fixed v1 value is:

    media/Instagram/

The v1 UI shall not ask the user to select or configure another media root. Missing `media` and `Instagram` directories shall be created automatically.

A future project or release may expose alternatives such as:

    Attachments/Instagram/

The underlying code shall therefore not scatter hard-coded media path strings throughout the implementation.

---

# 8. Per-Post Media Directory

Each captured Instagram post/reel shall receive its own media directory.

Directory format:

    <Sanitised Title> - <Instagram Post ID>

Example:

    Elite Mastery Roadmap - DTGNAC9E1jI/

Full example:

    Vault/
      media/
        Instagram/
          Elite Mastery Roadmap - DTGNAC9E1jI/

The Instagram ID shall be included to guarantee identity even when different posts have identical or similar titles.

---

# 9. Media Filenames

## 9.1 Carousel

Use:

    <PostID>-<Sequence>.<extension>

Example:

    DTGNAC9E1jI-01.jpg
    DTGNAC9E1jI-02.jpg
    DTGNAC9E1jI-03.jpg

Sequence numbers shall be zero-padded.

---

## 9.2 Reel

Primary video:

    <PostID>.mp4

Optional cover:

    <PostID>-cover.jpg

---

## 9.3 Download-only mode

Mode B uses the same deterministic media basenames as Mode A within its dedicated per-item directory.

Examples:

    DTGNAC9E1jI-01.jpg
    DTGNAC9E1jI-02.mp4
    DTGNAC9E1jI-cover.jpg

---

# 10. Markdown Note

Mode A shall create exactly one Markdown note for the Instagram capture.

The note shall not contain Base64-encoded media.

Images/videos shall be referenced through local Obsidian-compatible links.

---

# 11. Markdown Metadata

The Markdown note shall contain YAML frontmatter.

Minimum properties:

    source: instagram
    content_type:
    instagram_id:
    author:
    url:
    captured:
    media_count:

Example:

    ---
    source: instagram
    content_type: carousel
    instagram_id: DTGNAC9E1jI
    author: innovation
    url: https://www.instagram.com/p/DTGNAC9E1jI/
    captured: 2026-08-16T17:20:00+01:00
    media_count: 9
    ---

Additional metadata may be added if reliably available.

---

# 12. Markdown Body

The note body should contain:

1. title
2. source information
3. original Instagram caption
4. media section
5. local media embeds

Example:

    # Elite Mastery Roadmap

    ## Source

    Instagram post by @innovation

    https://www.instagram.com/p/DTGNAC9E1jI/

    ## Caption

    <Original caption>

    ## Media

    ![[media/Instagram/Elite Mastery Roadmap - DTGNAC9E1jI/DTGNAC9E1jI-01.jpg]]

    ![[media/Instagram/Elite Mastery Roadmap - DTGNAC9E1jI/DTGNAC9E1jI-02.jpg]]

The exact presentational structure may be refined without changing the storage architecture.

---

# 13. Caption Preservation

The application shall preserve the original Instagram caption as faithfully as technically possible.

Do not:

- summarise it,
- rewrite it,
- translate it,
- alter hashtags,
- deliberately remove emoji,
- perform AI transformations.

Normalisation necessary for Markdown safety is permitted.

---

# 14. Title Generation

The application shall derive a proposed human-readable note title.

Possible sources, in preferred order:

1. suitable title/heading detected from the post
2. useful first line of the caption
3. generated fallback

Fallback example:

    Instagram - innovation - DTGNAC9E1jI

The title shall remain editable before saving.

---

# 15. Filename and Path Sanitisation

All generated filesystem names shall be sanitised for the host operating system.

At minimum handle:

    < > : " / \ | ? *

Generated path components shall also replace Obsidian wikilink control characters:

    # ^ [ ]

Also handle:

- trailing periods
- trailing spaces
- excessive filename length
- empty generated titles
- reserved names where relevant
- control characters
- repeated replacement characters
- excessive whitespace

When truncating, preserve the canonical Instagram Post ID and reserve space for required numeric collision suffixes.

Sanitisation must not alter the original caption stored inside the note.

---

# 16. Duplicate Handling

## 16.1 Canonical Mode A identity

The canonical Instagram Post ID is the unique managed-capture identity within a configured vault.

Before starting Mode A, the utility shall search the managed Instagram media root for that Post ID and inspect its capture-state markers.

A valid completed capture shall stop the operation and inform the user. The application shall not offer another managed Markdown capture, alternate-title copy, or duplicate capture for the same Post ID.

If multiple managed directories match the same Post ID, the state is ambiguous and automatic capture shall stop.

The editable title is presentation metadata and shall not influence identity.

---

## 16.2 Mode A capture state and recovery

Each Mode A post directory shall use:

    .capture-incomplete.json
    .capture-complete.json

The incomplete marker shall be written before media writes begin. The complete marker shall be written after all required primary media and the Markdown note have been written successfully.

The complete marker is authoritative. If both markers exist, treat the capture as complete and remove the stale incomplete marker when practical.

When only a valid matching incomplete marker exists:

- inform the user that a previous operation was interrupted,
- offer Continue and Cancel,
- overwrite only deterministic media files owned by that Post ID,
- download a replacement successfully before opening its target for writing,
- leave unknown, unrelated, and obsolete files untouched,
- create no retry-suffixed media duplicates.

If the intended Markdown note already exists and identifies the same Post ID with valid local media references, finalize the complete marker rather than creating another note.

Malformed markers, identity mismatches, conflicting notes, and ambiguous state shall stop automatic recovery.

A directory or media filename without valid matching marker evidence shall never, by itself, authorize overwrite or establish successful completion.

---

## 16.3 Existing Markdown filename

If the proposed target note filename is already occupied by unrelated content, the user must be given an explicit choice:

- Replace
- Create Copy
- Cancel

Never silently overwrite an existing note.

These filename-collision options do not override the canonical Post-ID duplicate block.

---

## 16.4 Mode B directory collision

Mode B does not use Mode A capture markers. If its proposed per-item directory exists, create the next available numbered directory and leave the existing directory unchanged.

---

# 17. Settings

The utility shall maintain settings separately from Instagram page content.

Potential settings include:

- vault directory handle
- Instagram media path
- last note destination
- last storage mode
- preferred naming behaviour
- debug logging flag

The design should accommodate future settings without major restructuring.

---

# 18. Settings Management

The Tampermonkey userscript shall expose management commands where practical.

Recommended commands:

- Save current Instagram item
- Settings
- Change Obsidian vault
- Reset cached configuration

Changing the Instagram media root is not exposed in the v1 UI.

---

# 19. Media Extraction

The utility shall attempt to obtain the highest practical quality media URL available from the Instagram web page.

For carousel posts, the application shall collect all image and video items in their original sequence.

Media items shall identify:

- type: image or video
- role: primary or auxiliary
- primary sequence where applicable

`media_count` shall count primary Instagram items only:

- single image: 1
- carousel: number of original carousel items
- reel: 1

A reliably available reel cover is optional auxiliary media. When downloaded it shall be saved as `<PostID>-cover.jpg`, included in the Markdown note and completion marker, and excluded from `media_count`. Cover failure shall warn but shall not fail an otherwise successful reel capture.

The implementation shall guard against:

- duplicate URLs
- navigation loops
- lazy loading
- entering a carousel on a non-first slide
- inaccessible slides
- changes to Instagram DOM markup

---

# 20. Network Retrieval

Media retrieval shall support Instagram/CDN resources that may not be accessible through ordinary same-origin browser requests.

For the Tampermonkey implementation, an appropriate Tampermonkey network API may be used through an isolated network adapter.

Media shall be downloaded as binary data rather than re-rendered screenshots wherever possible.

---

# 21. Browser Filesystem Support

The primary implementation shall use the browser File System Access API for local directory access.

The first supported runtime is Tampermonkey on Chromium desktop.

If the API is unavailable, the utility shall provide a clear error rather than silently degrading into unpredictable behaviour.

Chrome-extension implementation and validation are outside this project's initial release.

---

# 22. Error Handling

The UI shall surface actionable errors.

At minimum handle:

- unsupported page
- unsupported Instagram item
- media extraction failure
- media download failure
- filesystem picker cancellation
- filesystem permission denied
- persisted directory handle no longer valid
- unable to create destination folder
- unable to create media folder
- unable to write Markdown
- malformed or conflicting capture-state marker
- ambiguous interrupted-capture state
- completed Post-ID duplicate
- insufficient browser capability

---

# 23. User Cancellation

Cancelling:

- the modal,
- a folder selector,
- filesystem permission,
- overwrite prompt,

shall abort the operation safely.

Partial writes shall be represented and recovered through the Mode A capture-state protocol. Cancellation shall never create a complete marker.

---

# 24. Scope of Initial Release

Initial release priorities:

1. reliable carousel support
2. Mode A
3. Mode B
4. persisted vault access
5. Markdown generation
6. duplicate handling
7. single-image posts
8. reels

Implementation may be phased, but the architecture must accommodate all three content types from the outset.

---

# 25. Future Scope

Possible future capabilities, explicitly outside the initial requirement:

- Chrome extension packaging
- OCR
- automatic tagging
- AI summarisation
- automatic topic classification
- richer Obsidian templates
- configurable metadata schemas
- batch capture
- additional social platforms
