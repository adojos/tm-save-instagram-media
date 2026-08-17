# AGENTS.md

## Project

Instagram Capture Utility

## Purpose

Build a professional browser-based capture utility for Instagram that initially runs as a Tampermonkey userscript and is deliberately architected so it can later be migrated into a Chrome/Chromium browser extension with minimal redesign.

The utility captures Instagram images, carousel posts, and reels and supports two distinct storage modes:

1. Save to an Obsidian vault
2. Download media to an arbitrary filesystem folder

---

## Authoritative Documents

Before modifying implementation code, read:

1. `AGENTS.md`
2. `Requirements.md`
3. `Architecture.md`
4. `Decisions.md`

These documents define the currently approved design.

If implementation constraints require a deviation, do not silently change the architecture. Document:

- the issue,
- the affected requirement,
- the proposed alternative,
- the trade-off,

before implementing the deviation.

---

## Core Engineering Principles

### 1. Keep the design modular

Do not build a monolithic userscript.

Separate concerns into logical modules/components for:

- Instagram content detection
- Instagram metadata extraction
- media discovery
- media downloading
- filesystem access
- Obsidian-specific storage
- generic filesystem storage
- settings persistence
- duplicate handling
- UI/modal handling
- filename sanitisation
- Markdown generation

The initial deliverable may ultimately be bundled into one `.user.js` file, but the internal design must remain modular.

---

### 2. Preserve future Chrome-extension portability

Avoid unnecessary Tampermonkey-specific coupling.

Where practical, isolate Tampermonkey APIs behind adapters.

For example:

- network request adapter
- settings adapter
- filesystem adapter
- UI adapter

The core capture logic should not depend directly on Tampermonkey APIs where that dependency can reasonably be abstracted.

---

### 3. Two storage modes must remain separate

The application supports:

#### Mode A — Obsidian

Produces:

- downloaded media
- one Markdown note
- Obsidian-compatible local media embeds
- structured metadata

#### Mode B — Download Only

Produces:

- one per-item directory named `<Sanitised Title> - <PostID>`
- downloaded media only inside that directory

If the directory already exists, create a non-destructive numbered copy such as:

`<Sanitised Title> - <PostID> - 2`

Mode B must not create:

- Markdown files
- Obsidian folders
- YAML metadata
- Obsidian-specific paths

---

### 4. Do not store filesystem paths in Instagram cookies

Obsidian vault access must use the browser File System Access API.

The selected vault root must be represented by a `FileSystemDirectoryHandle`.

Persist the directory handle using IndexedDB where supported.

A plain filesystem pathname is not sufficient because it does not confer filesystem permissions.

---

### 5. Cache the vault root, not a hard-coded note destination

The persistent identity of the configured Obsidian vault is the vault root.

Example:

`D:\Knowledge\MyVault`

The note destination is chosen independently.

The application may remember the last note destination as a convenience setting, but this must remain logically distinct from the vault root.

Select note destinations through an application-owned vault-relative folder browser populated from the cached vault handle. Do not use the native directory picker as the primary note-destination UI.

---

### 6. Centralise Instagram media inside the vault

The default managed media hierarchy is:

`media/Instagram/`

For v1 this path is fixed in the UI. Keep it centrally configured internally so a later project or release can expose it without redesign.

Each captured Instagram item gets its own subdirectory:

`media/Instagram/<Title> - <PostID>/`

Example:

`media/Instagram/Elite Mastery Roadmap - DTGNAC9E1jI/`

Do not dump all Instagram media into a single flat directory.

Do not create image folders alongside every Markdown note.

---

### 7. Use deterministic media filenames

Inside the post-specific media directory, use deterministic names based on the Instagram post ID.

Example carousel:

- `DTGNAC9E1jI-01.jpg`
- `DTGNAC9E1jI-02.jpg`
- `DTGNAC9E1jI-03.mp4`

Mixed image/video carousels must preserve Instagram sequence across media types.

Example reel:

- `DTGNAC9E1jI.mp4`

Optional reel cover:

- `DTGNAC9E1jI-cover.jpg`

A reel cover is auxiliary media. When reliably available it is saved and embedded in the Markdown note, but it does not increment `media_count` and its failure does not fail an otherwise successful reel capture.

Do not rely solely on post titles for uniqueness.

Generated path components must replace both operating-system-invalid characters and Obsidian wikilink control characters, including `#`, `^`, `[`, and `]`. This sanitisation must never alter the caption stored in the note.

---

### 8. Preserve original Instagram content

Do not automatically summarise, rewrite, translate, or improve captions.

Capture and preserve the Instagram caption as faithfully as technically possible.

Derived metadata such as a sanitised note title may be created separately.

---

### 9. Never embed carousel images as Base64

Obsidian notes must reference locally downloaded media files.

Do not store large Base64/Data-URI images inside Markdown.

---

### 10. Generate Obsidian-compatible Markdown

Mode A notes must use:

- YAML frontmatter
- local Obsidian-compatible media embeds
- original caption
- source URL
- Instagram author
- Instagram post ID
- content type
- capture timestamp
- media count

---

### 11. Avoid brittle Instagram selectors where possible

Instagram DOM structure is not a stable public API.

Use layered extraction strategies such as:

1. semantic/accessibility attributes
2. structured page metadata
3. visible DOM relationships
4. geometry-based fallbacks where appropriate

Keep selectors isolated so they are easy to update.

---

### 12. Build explicit error handling

Do not silently fail.

Handle at minimum:

- unsupported Instagram content
- private/unavailable posts
- failed media extraction
- failed media download
- expired filesystem permission
- invalid persisted directory handle
- duplicate note
- duplicate media
- malformed or conflicting capture-state markers
- interrupted-capture recovery
- filesystem write errors
- filename collisions
- cancelled folder picker
- browser incompatibility

---

### 13. Do not overwrite user content without confirmation

If a proposed Markdown filename is occupied by unrelated content, the application must not silently overwrite it.

Supported behaviours should include:

- Replace
- Create Copy
- Cancel

Completed Mode A captures are identified by canonical Instagram Post ID and must block another managed capture of the same item.

Mode A recovery must follow the accepted two-marker protocol:

- `.capture-incomplete.json` records an operation in progress
- `.capture-complete.json` is the authoritative completion signal

Only a valid matching incomplete marker permits recovery overwrites. Inform the user and offer Continue or Cancel before overwriting deterministic media owned by that Post ID. Never overwrite media merely because a directory or filename exists.

Mode B never overwrites an existing per-item directory; it creates the next numbered directory instead.

---

## Development Workflow

Before major implementation:

1. inspect the requirements,
2. propose an implementation plan,
3. identify browser/API constraints,
4. identify Instagram-specific fragility,
5. implement incrementally,
6. test each storage mode independently.

Prefer small, reviewable changes.

---

## Initial Target Environment

Primary target:

- Chromium-family desktop browser
- Tampermonkey
- desktop Instagram website
- desktop Obsidian vault on local filesystem

Cross-browser support is desirable but not required for the first implementation.

---

## Non-Goals for Initial Version

Do not add unless separately approved:

- AI summarisation
- OCR
- automatic categorisation
- automatic Obsidian tagging using AI
- cloud upload
- Instagram authentication handling
- bulk historical Instagram crawling
- scheduled capture
- automatic reposting
- remote database storage
