# Instagram Capture Utility — Architecture Decisions

This document records approved architectural decisions and the reasoning behind them.

---

# ADR-001 — Support Two Explicit Storage Modes

## Status

Accepted

## Decision

The utility shall support:

### Mode A — Obsidian

Downloads media and creates a Markdown note.

### Mode B — Download Only

Downloads media to an arbitrary filesystem directory.

## Reason

The tool should remain useful outside Obsidian and should not impose knowledge-management behaviour on ordinary media downloads.

## Consequence

Storage logic must use separate providers/adapters.

---

# ADR-002 — Use the File System Access API

## Status

Accepted

## Decision

Filesystem interaction shall use the browser File System Access API where available.

## Reason

The requirement is to write directly into user-selected filesystem directories rather than merely trigger browser downloads.

## Consequence

Chromium desktop is the primary initial browser target.

---

# ADR-003 — Persist the Obsidian Vault Handle in IndexedDB

## Status

Accepted

## Decision

Persist the selected Obsidian vault `FileSystemDirectoryHandle` in IndexedDB where supported.

## Rejected Alternatives

### Instagram cookie

Rejected because filesystem capability should not be coupled to Instagram session state.

### Plain filesystem path

Rejected because a path string does not grant filesystem permission.

### Re-select vault every time

Rejected because it creates unnecessary friction.

## Consequence

The application must check persisted-handle permission on later sessions and request renewal when required.

---

# ADR-004 — Cache the Vault Root Separately from Note Destination

## Status

Accepted

## Decision

The configured Obsidian vault root is persistent state.

The user's note destination is separate state.

The application may remember the last note destination for convenience.

## Reason

A user may save consecutive captures to different subject folders while still using the same vault.

---

# ADR-005 — Use a Central Vault Media Root

## Status

Accepted

## Decision

Instagram media shall be stored under:

    media/Instagram/

by default.

## Rejected Alternative

Creating an `Images` directory next to every Markdown note.

## Reason

Per-note attachment directories would clutter the knowledge hierarchy.

A central media root keeps knowledge folders cleaner and makes media easier to manage.

---

# ADR-006 — Use One Media Subdirectory per Instagram Item

## Status

Accepted

## Decision

Each Instagram capture shall use:

    media/Instagram/<Title> - <PostID>/

## Rejected Alternative

A single flat:

    media/Instagram/

directory containing hundreds or thousands of files.

## Reason

Per-post media directories improve:

- organisation
- cleanup
- human inspection
- collision avoidance
- future migration

---

# ADR-007 — Include Instagram Post ID in Media Directory Name

## Status

Accepted

## Decision

Directory naming format:

    <Human-readable Title> - <PostID>

Example:

    Elite Mastery Roadmap - DTGNAC9E1jI

## Reason

Titles are not unique.

The Instagram post ID provides stable identity while retaining readable folder names.

---

# ADR-008 — Use Deterministic Media Filenames

## Status

Accepted

## Decision

Carousel:

    <PostID>-01.jpg
    <PostID>-02.jpg

Reel:

    <PostID>.mp4

Cover:

    <PostID>-cover.jpg

## Reason

Deterministic naming provides:

- collision resistance
- duplicate detection
- reproducibility
- easier troubleshooting

---

# ADR-009 — Do Not Embed Images as Base64 in Markdown

## Status

Accepted

## Decision

Obsidian notes shall reference local media files.

## Rejected Alternative

Base64/Data-URI encoded media inside Markdown.

## Reason

Although Base64 would create a physically self-contained note, it would:

- increase file size,
- degrade source readability,
- make diffs difficult,
- increase indexing/sync overhead,
- reduce maintainability.

The central media architecture provides a better balance.

---

# ADR-010 — Keep Markdown Notes Independent from Media Location

## Status

Accepted

## Decision

The note can reside anywhere inside the vault.

Media remains under the central Instagram media hierarchy.

Example:

    AI/Prompt Engineering/Elite Mastery Roadmap.md

references:

    media/Instagram/Elite Mastery Roadmap - DTGNAC9E1jI/

## Reason

Knowledge organisation and media storage are different concerns.

---

# ADR-011 — Do Not Automatically Search the Entire Vault for Similar Media Folders

## Status

Accepted

## Decision

The initial default media location shall be deterministic:

    media/Instagram/

If it does not exist, the application may create it.

The architecture shall allow the media location to become configurable.

## Rejected Alternative

Recursively search for directories such as:

- Media
- media
- Images
- images
- Attachments
- Instagram

and automatically choose one.

## Reason

Automatic discovery becomes ambiguous when multiple legitimate folders exist.

Predictable behaviour is preferable to guessing.

---

# ADR-012 — Make Media Root Configurable at the Architecture Level

## Status

Accepted

## Decision

Although the initial default is:

    media/Instagram/

the path shall be represented as a configurable setting.

## Reason

A future browser extension may expose richer user preferences and users may already have attachment conventions.

## Consequence

Do not hard-code the path throughout the codebase.

---

# ADR-013 — Preserve Instagram Caption Without AI Modification

## Status

Accepted

## Decision

The original caption shall be retained as faithfully as possible.

## Reason

The capture tool is an archival/knowledge-ingestion utility, not an AI rewriting pipeline.

Future AI enrichment can be implemented separately.

---

# ADR-014 — Generate Human-Readable Editable Titles

## Status

Accepted

## Decision

The application shall propose a meaningful title and allow the user to edit it.

Fallback:

    Instagram - <Author> - <PostID>

## Reason

Using only Instagram IDs would produce a poor knowledge-management experience.

---

# ADR-015 — Separate Instagram Extraction from Storage

## Status

Accepted

## Decision

Instagram extraction shall produce a generic CaptureItem model.

Storage providers consume that model.

## Reason

This enables:

- cleaner testing
- easier maintenance
- Mode A / Mode B separation
- future Chrome-extension migration
- potential future support for other social platforms

---

# ADR-016 — Isolate Tampermonkey-Specific APIs

## Status

Accepted

## Decision

Tampermonkey-specific functionality shall be hidden behind adapters where practical.

## Reason

The utility is intended to become a Chrome extension later.

---

# ADR-017 — Prefer Original Media Retrieval Over Screenshots

## Status

Accepted

## Decision

Where practical, retrieve the underlying Instagram/CDN media rather than capturing rendered screenshots.

## Reason

This gives:

- higher quality
- cleaner output
- no browser UI
- no carousel controls
- deterministic media files

---

# ADR-018 — Use a Custom Modal

## Status

Accepted

## Decision

The application shall use an in-page custom modal rather than relying on basic JavaScript prompt/confirm dialogs.

## Reason

The tool is intended to have professional, extensible UX.

The modal will later accommodate:

- storage mode
- note title
- destination information
- settings
- progress
- errors

---

# ADR-019 — Handle Instagram as an SPA

## Status

Accepted

## Decision

The userscript shall survive Instagram client-side navigation.

## Reason

Users frequently navigate between posts without full page reloads.

## Consequence

UI injection must be idempotent and route changes must be detected.

---

# ADR-020 — Write the Markdown Note After Media

## Status

Accepted

## Decision

In Mode A, write media first and Markdown last.

## Reason

This reduces the chance of leaving a completed-looking note containing broken media links if media download fails.

---

# ADR-021 — Do Not Silently Overwrite Existing Notes

## Status

Accepted

## Decision

Existing Markdown target must trigger:

- Replace
- Create Copy
- Cancel

## Reason

User-authored knowledge content must not be overwritten automatically.

---

# ADR-022 — Reuse Existing Deterministic Media Where Appropriate

## Status

Superseded by ADR-029

## Decision

If media already exists at its deterministic destination, the implementation may reuse it.

## Reason

Repeated capture of the same Instagram post should not unnecessarily create duplicate binaries.

---

# ADR-023 — Initial Browser Priority is Chromium Desktop

## Status

Accepted

## Decision

Optimise the first implementation for Chromium desktop.

## Reason

The required direct filesystem workflow depends heavily on File System Access API support.

Cross-browser compatibility can be evaluated later.

---

# ADR-024 — Initial Implementation is Tampermonkey, Not the Final Product

## Status

Accepted

## Decision

Tampermonkey is the first delivery mechanism.

The design shall treat a future Chrome extension as an expected evolution rather than a completely separate implementation.

## Consequence

Avoid deeply coupling business logic to userscript-specific mechanics.

---

# ADR-025 — Use a Vault-Relative Folder Browser for Obsidian Note Destinations

## Status

Accepted

## Decision

When operating in Obsidian mode, the application shall not use the
native filesystem directory picker as the primary mechanism for selecting
the Markdown note destination.

The application shall present an application-owned folder browser populated
by traversing the cached Obsidian vault FileSystemDirectoryHandle.

Only directories reachable beneath the configured vault root shall be
presented as valid note destinations.

The application may remember the previously selected vault-relative path
and preselect it during subsequent captures.

FileSystemDirectoryHandle.resolve() may additionally be used for defensive
validation when comparing filesystem handles.

## Reason

showDirectoryPicker({ startIn: vaultHandle }) only controls the initial
directory displayed by the native picker. It does not constrain the user
to directories beneath the Obsidian vault.

An application-owned vault browser guarantees that all presented
destinations belong to the configured vault and provides a faster,
Obsidian-focused user experience.

It also enables future capabilities such as:

- remembering recent locations
- folder search
- favourite destinations
- creating vault folders
- Chrome-extension migration

## Rejected Alternative

Use the native directory picker beginning at the vault root and reject
selections when:

    await vaultHandle.resolve(selectedHandle)

returns null.

This approach is technically valid but provides a less controlled and
less efficient user experience.

---

# ADR-026 — Instagram Post ID Is the Canonical and Unique Capture Identity

## Status

Accepted

## Decision

An Instagram post or reel shall be uniquely identified by its canonical
Instagram Post ID.

Within a configured Obsidian vault, the capture utility shall permit only
one successfully completed managed capture per Instagram Post ID.

Before beginning a new Mode A capture, the application shall determine
whether that Post ID has already been successfully captured.

If an existing completed capture is found, the operation shall stop and
inform the user that the Instagram item already exists in the vault.

The application shall not offer duplicate creation, alternate-title saving,
or another Markdown capture for the same canonical Instagram ID.

The editable title is presentation metadata only and shall not influence
canonical identity or duplicate detection.

If the user requires another Markdown representation of the same captured
material, that duplication or renaming shall be performed manually within
Obsidian and is outside the responsibility of the capture utility.

The mere existence of a partially created media directory shall not, by
itself, constitute a successfully completed capture. Successful-capture
semantics are defined by ADR-029.

---

# ADR-027 — Use Non-Destructive Filename Collision Recovery

## Status

Superseded by ADR-029

## Decision

The original decision proposed leaving an existing deterministic media file
unchanged and writing a newly downloaded file with a retry suffix.

Examples:

    DTGNAC9E1jI-01-retry-1.jpg
    DTGNAC9E1jI-01-retry-2.jpg

## Supersession Reason

After defining explicit capture-state markers, retry filenames were no
longer necessary for verified interrupted captures. ADR-029 replaces this
strategy with controlled overwriting of application-managed deterministic
media files.

---

# ADR-028 — Use a Lightweight Incomplete-Capture Marker

## Status

Superseded by ADR-029

## Decision

The original decision proposed a single marker named:

    .capture-incomplete

inside the post-specific media directory while capture was in progress.

## Supersession Reason

An incomplete marker proves that an operation started, but its absence does
not prove successful completion. ADR-029 introduces separate incomplete and
complete state files so that successful completion has a positive,
vault-resident signal.

---

# ADR-029 — Use Two Capture-State Markers and Controlled Recovery Overwrites

## Status

Accepted

## Decision

Mode A shall use two lightweight JSON state files inside the post-specific
media directory:

    .capture-incomplete.json
    .capture-complete.json

The incomplete marker records that a capture has started. It shall include
at minimum:

- schema version
- Instagram Post ID
- intended vault-relative Markdown note path
- capture start timestamp

The complete marker is the authoritative positive record that the capture
committed successfully. It shall include at minimum:

- schema version
- Instagram Post ID
- vault-relative Markdown note path
- actual media filenames referenced by the note
- completion timestamp

## Capture Sequence

The application shall:

1. locate or create the post-specific media directory,
2. write the incomplete marker before media writes begin,
3. download and write all required media,
4. create the Markdown note after the required media succeeds,
5. write the complete marker after Markdown creation succeeds,
6. remove the incomplete marker as best-effort cleanup.

The complete marker is authoritative. If both markers exist, the capture
shall be treated as complete and the stale incomplete marker may be removed.

## Duplicate and Recovery Rules

If a valid complete marker exists for the Instagram Post ID, the application
shall block another Mode A capture in accordance with ADR-026.

If only a valid incomplete marker exists and no intended note exists, the
application shall treat the previous operation as interrupted and offer
recovery.

If only a valid incomplete marker exists and the intended note exists, the
application shall verify that:

- the note identifies the same Instagram Post ID,
- the note references the expected captured media,
- the referenced media files exist.

If these checks succeed, the application shall create the complete marker
and remove the stale incomplete marker without creating another note.

If the note conflicts with the marker or recovery state is ambiguous, the
application shall stop and report the condition. It shall not overwrite the
note or guess.

A media directory containing neither marker shall not be treated as a
completed capture.

## Controlled Media Overwrite During Recovery

When a valid incomplete marker identifies an interrupted capture and
recovery requires downloading media again, the application shall:

- inform the user that the previous operation was interrupted,
- offer Continue and Cancel,
- overwrite only deterministic media filenames owned by that Post ID,
- download each replacement successfully before opening its target for
  writing,
- leave unrelated, unknown, and obsolete files untouched,
- create no retry-suffixed duplicate media files.

The application shall not overwrite media merely because a directory or
filename exists. A valid matching incomplete marker is required.

Malformed markers, Post ID mismatches, missing ownership evidence, and
ambiguous state shall stop automatic recovery.

## Reason

Separate incomplete and complete markers provide explicit negative and
positive transaction state without a vault-wide capture registry.

Controlled recovery overwrites retain deterministic filenames and avoid
wasting storage on retry duplicates, while marker validation and user
confirmation prevent broad or accidental destructive behaviour.

---

# ADR-030 — Use a Fixed Default Instagram Media Root in v1

## Status

Superseded by ADR-034

## Decision

The initial release shall use the following vault-relative Instagram media
root:

    media/Instagram/

If media and/or Instagram do not exist beneath the configured Obsidian vault
root, the application shall create the missing directories automatically.

The initial user interface shall not ask the user to select or configure an
alternative Instagram media root.

The media path shall nevertheless be represented internally as a
configurable application setting or centrally defined configuration value
rather than being duplicated as hard-coded strings throughout the
implementation.

## Future

A later Tampermonkey version or Chrome-extension settings interface may
expose the media-root setting to the user without changing the underlying
storage architecture.

## Rejected for v1

- recursively searching the vault for folders named Media, Images,
  Attachments, Instagram, or similar names
- prompting for the media folder on every capture
- requiring first-run media-folder configuration

## Reason

A deterministic default produces the simplest and most predictable
first-release workflow while preserving future configurability.

---

# ADR-031 — Model Primary and Auxiliary Media Explicitly

## Status

Accepted

## Decision

Instagram captures shall model media as an ordered collection of typed
items.

Supported primary media types in v1 are:

- image
- video

Each media item shall identify its role as:

- primary
- auxiliary

Carousel media shall preserve Instagram's original sequence regardless of
media type.

Example:

    <PostID>-01.jpg
    <PostID>-02.jpg
    <PostID>-03.mp4
    <PostID>-04.jpg

File extensions shall be derived from validated media type information
rather than assumed solely from the media URL.

media_count shall represent the number of primary Instagram media items,
not the number of physical files downloaded.

Examples:

    single image: media_count = 1
    9-item carousel: media_count = 9
    reel: media_count = 1

A reel cover, when reliably available, shall be treated as auxiliary media
and saved as:

    <PostID>-cover.jpg

The reel cover shall not increment media_count.

Auxiliary media retrieval is best-effort. Failure to discover or download a
reel cover shall produce at most a warning and shall not prevent a capture
from completing when all required primary media succeeds.

When a reel cover is successfully downloaded:

- it shall be included in the generated Markdown note,
- it shall be recorded in the complete capture marker,
- it shall remain auxiliary and excluded from media_count.

## Reason

This keeps media_count stable and semantically meaningful while supporting
mixed image/video carousels and reel-specific auxiliary assets.

---

# ADR-032 — Use Per-Item Directories and Non-Destructive Directory Collisions in Mode B

## Status

Accepted

## Decision

In Mode B — Download Only, the user selects a parent destination directory.
The application shall create a dedicated subdirectory for the captured
Instagram item using:

    <Sanitised Title> - <Canonical Post ID>

All media belonging to that item shall be stored within this directory
using the deterministic filename rules established by ADR-008 and ADR-031.

If the post directory already exists, the application shall create the next
available non-destructive directory name:

    <Title> - <PostID> - 2
    <Title> - <PostID> - 3

and continue incrementing the numeric suffix until an available directory
name is found.

The generated title shall be sanitised and length-limited while reserving
space for the canonical Post ID and any required numeric collision suffix.

The application shall never silently overwrite an existing Mode B
directory or any file within it.

Mode B shall continue to create:

- no Markdown note
- no YAML or Obsidian-specific metadata
- no Obsidian-specific media hierarchy

## Reason

Per-item directories keep related downloaded media together. Allocating a
new directory on collision provides predictable, non-destructive repeated
downloads without requiring Mode A capture-state markers or overwrite
recovery semantics.

---

# ADR-033 — Sanitize Obsidian Link-Control Characters in Generated Paths

## Status

Accepted

## Decision

Generated note filenames, media-directory names, and other generated
filesystem path components shall replace characters that could alter
Obsidian wikilink semantics rather than relying on link escaping.

In addition to operating-system-invalid characters, sanitization shall
handle at minimum:

    # ^ [ ]

The vertical bar is already included in the operating-system-invalid
character set and shall also be replaced.

Sanitization shall also handle:

- control characters
- trailing periods and spaces
- excessive component length
- empty results
- reserved operating-system names
- repeated replacement characters and excessive whitespace

The implementation shall preserve the canonical Instagram Post ID when
truncating generated names and shall reserve room for required collision
suffixes.

This sanitization applies only to generated filesystem names and paths. It
shall not alter the original Instagram caption stored in the Markdown note.

## Reason

Characters such as #, ^, [, ], and | have structural meaning in Obsidian
wikilinks. Replacing them in application-generated path components produces
predictable local embeds and avoids fragile or implementation-specific link
escaping.

---

# ADR-034 — Discover or Configure a Vault-Relative Media Directory

## Status

Accepted

## Decision

The Markdown-note destination and the Instagram media location shall remain
independent.

When no valid persisted Instagram media path exists, the application shall
inspect only the immediate children of the configured Obsidian vault root for
a directory named `Media`, using case-insensitive comparison.

If one matching directory exists, the application shall reuse it, create or
reuse its `Instagram` child, preserve the actual on-disk casing in Markdown
links, and persist the resulting vault-relative Instagram path in IndexedDB.

If no matching first-level directory exists, the application shall ask the
user whether to:

1. create `Media` directly beneath the vault root, or
2. choose another parent directory through the vault-relative folder browser
   and create or reuse `Media` there.

If the custom selected directory is itself named `Media`, it may be used
directly. In every case, managed Instagram item directories remain beneath an
`Instagram` child of the resolved Media directory.

A valid persisted path shall be reused on later captures. If it no longer
resolves beneath the configured vault, the application shall clear it and run
discovery again.

The application shall not recursively search the vault automatically. If
multiple immediate directories compare equal to `Media`, resolution is
ambiguous and shall stop rather than guessing.

The native directory picker continues to configure the vault root only. Note
destinations and custom Media parents use the application-owned vault browser.

## Supersedes

This decision supersedes ADR-030's fixed `media/Instagram/` rule while
retaining a deterministic `Instagram` managed hierarchy beneath the resolved
Media directory.

## Reason

Obsidian vaults commonly already contain a first-level Media directory, and
users may intentionally keep attachments elsewhere. Immediate discovery gives
the conventional layout a zero-configuration path, while explicit
vault-relative selection supports custom organisation without unconstrained
filesystem traversal or coupling media storage to note placement.
