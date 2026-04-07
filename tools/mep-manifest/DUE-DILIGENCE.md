# MEP Manifest Manager — Architecture Due Diligence

> **Status:** Draft for Architect Review
> **Date:** 2026-04-01

---

## Table of Contents

1. [Overview & Goals](#overview--goals)
2. [System Context](#system-context)
3. [Architecture Approach](#architecture-approach)
4. [Implementation Details](#implementation-details)
5. [UI Approach](#ui-approach)
6. [Risks & Open Questions](#risks--open-questions)

---

## Overview & Goals

The **MEP Manifest Manager** is a purpose-built editor embedded inside the Document Authoring (DA) shell. It allows content authors to create, edit, preview, and publish **MEP (Manifest Experience Personalization)** files — the structured configuration that drives personalization, A/B testing, and promotional experiences on AEM Edge Delivery sites.

**Problem it solves:** Without this tool, authors must manually edit raw spreadsheet rows in DA to define personalization rules. This is error-prone, provides no visual feedback, and requires knowledge of the MEP schema. The tool replaces that with a structured, form-driven UI that abstracts the underlying data format entirely.

**Key user journeys:**
- Browse the DA repository and open an existing manifest
- Create a new manifest from scratch and define its type and metadata
- Build experience rules — mapping CSS selectors to content actions across named audience segments
- Define reusable placeholder key/value pairs
- Save, preview, and publish the manifest to AEM Live

---

## System Context

The tool runs as a **DA plugin** — loaded inside the DA shell as an iframe. It communicates with the DA shell via the DA SDK (postMessage bridge), which provides the authenticated user's organization context and bearer token. All manifest files are stored in and retrieved from the **DA Admin API**.

```
┌──────────────────────────────────────────────────┐
│                  DA Shell (da.live)               │
│                                                  │
│   ┌──────────────────────────────────────────┐   │
│   │       MEP Manifest Manager (iframe)      │   │
│   │                                          │   │
│   │  File Browser → Grid Editor → Toolbar   │   │
│   └────────────────┬─────────────────────────┘   │
│                    │ DA SDK (postMessage)         │
└────────────────────┼─────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │   DA Admin API      │
          │  (admin.da.live)    │
          │  List / Read / Write│
          │  Preview / Publish  │
          └─────────────────────┘
                     │
          ┌──────────▼──────────┐
          │  AEM Edge Delivery  │
          │  (aem.page/.live)   │
          │  Consumes manifests │
          └─────────────────────┘
```

**Actors:**
- **Content Author** — Uses the tool to manage personalization manifests
- **DA Shell** — Hosts the iframe, provides auth context via the DA SDK
- **DA Admin API** — Stores manifest files and handles preview/publish operations
- **AEM Edge Delivery** — Reads published manifests at runtime to drive personalization

---

## Architecture Approach

### Single-Page Application, No Framework

The tool is a lightweight SPA built in **vanilla JavaScript (ES6 modules)** with no third-party UI framework and no build step required. This is consistent with the broader AEM Edge Delivery philosophy of zero-dependency, framework-free tooling. The benefit is a minimal footprint that loads instantly inside the DA iframe with no compilation overhead.

### Layered, Modular Design

The application is organized into three clear layers with strict boundaries between them:

```
┌────────────────────────────────────┐
│         UI Layer                   │
│  Renders views, handles DOM events │
└────────────────┬───────────────────┘
                 │ calls
┌────────────────▼───────────────────┐
│      Orchestration Layer           │
│  Manages state transitions,        │
│  wires UI to data, handles actions │
└────────────────┬───────────────────┘
                 │ calls
┌────────────────▼───────────────────┐
│         Data Layer                 │
│  Model, DA API adapter, serializer │
└────────────────────────────────────┘
```

- The **Data Layer** has no knowledge of the DOM or the UI.
- The **UI Layer** has no knowledge of the DA API.
- The **Orchestration Layer** (app) is the only place that connects the two.

### Reactive Model

A central `ManifestModel` object holds all application state. Every mutation (edit, add, remove, reorder) marks the model as "dirty" and notifies registered listeners. UI elements subscribe to these change events — for example, the toolbar reflects unsaved changes, and the status bar toggles between "Saved" and "Unsaved changes" automatically.

### Dual-Mode Bootstrap

The tool is designed to operate in two contexts:
1. **Inside DA shell (production):** The DA SDK resolves with the real org context and bearer token.
2. **Standalone on localhost (development):** If the SDK is unavailable, the app falls back to a mock context so developers can run and test the tool locally without needing the full DA environment.

This is implemented via a race condition at startup — the SDK call races against a short timeout. If the SDK wins, the real context is used. If the timeout wins, the mock context takes over.

---

## Implementation Details

### Manifest Lifecycle

Every manifest moves through the same lifecycle:

```
Open / New → Edit → Save → Preview → Publish
```

| Stage | Description |
|-------|-------------|
| **Open** | Author picks a JSON file from the file browser. The raw DA sheet data is fetched and parsed into the internal model. |
| **New** | A blank model is created with one default experience column and one empty row, giving authors a starting point. |
| **Edit** | Author modifies info fields, placeholders, or experience rows/columns. The model tracks every change and marks itself dirty. |
| **Save** | The model is serialized back to the DA multi-sheet format and written to the DA Admin API via an authenticated PUT. |
| **Preview** | A preview build is triggered via the DA Admin API. The tool surfaces a preview URL the author can open or copy. |
| **Publish** | The manifest is auto-saved first, then pushed live via the DA Admin API. A live URL is surfaced for verification. |

### File Browser

The file browser provides navigation of the DA repository. It fetches directory listings from the DA Admin API, handles pagination transparently, and classifies items as folders, JSON sheets, or other documents. Only JSON sheets (manifest files) are actionable; all other file types are visible but non-interactive. Navigation is breadcrumb-based with path tracking.

### Experience Grid — Columns & Rows

The experiences grid is the most complex part of the tool:

- **Columns are fully dynamic.** Any named audience segment (e.g., `all`, `target-returning-users`) can be added as a column. There is no fixed schema — the column set is discovered from the data.
- **Rows are reorderable** via drag-and-drop, allowing authors to control the execution sequence of personalization rules.
- **Adding a column** automatically adds an empty value for that column to every existing row, ensuring the model never has missing entries.
- **Structural changes** (add/remove row or column) trigger a full grid re-render. Individual cell edits update only the model — no re-render — keeping the typing experience smooth.

### Data Serialization

The internal model and the DA wire format are two distinct representations. The tool handles bidirectional translation:

- **On open:** The DA multi-sheet JSON is parsed into the internal model. Key matching is case-insensitive and normalizes hyphens, ensuring backwards compatibility with manifests created before the tool existed.
- **On save:** The internal model is serialized back to the DA multi-sheet format, including all required pagination metadata fields.

### API Communication

All communication with the DA Admin API goes through a single adapter module. The adapter wraps five operations — list files, read manifest, save manifest, trigger preview, trigger publish — and handles authentication headers, pagination (via continuation tokens), and HTTP error mapping uniformly.

---

## UI Approach

### Layout

The app uses a fixed chrome layout with a scrollable content area:

```
┌────────────────────────────────────────────┐
│  Toolbar — Save / Preview / Publish        │  48px
├────────────────────────────────────────────┤
│  Tab Nav — Experiences | Info | Placeholders│  40px
├────────────────────────────────────────────┤
│                                            │
│  Tab Content (scrollable)                  │  flex: 1
│                                            │
├────────────────────────────────────────────┤
│  Status Bar — Saved / Unsaved changes      │  24px
└────────────────────────────────────────────┘
```

### Three Tabs

| Tab | Purpose |
|-----|---------|
| **Experiences** | The main grid editor. Authors define experience rules as rows — each row specifies an action type, a CSS selector to target, an optional page filter, and content values per audience column. |
| **Info** | Manifest metadata — type (personalization, test, promo), execution order (First, Normal, Last), and an optional analytics override name. |
| **Placeholders** | A simple key/value list for reusable content tokens shared across experiences. |

All three tab panels are rendered once at load time and toggled with CSS visibility. Tab switching does not re-render any content, which preserves scroll position and input focus state.

### Experiences Grid

The grid is an HTML table with a sticky header row. Each row represents one experience rule:

- **Action column** — Dropdown with six MEP action types, each color-coded for instant visual differentiation (green, yellow, red, blue, pink, purple).
- **Selector column** — Free-text CSS selector input.
- **Page Filter column** — Free-text URL filter expression.
- **Experience columns** — One text input per named audience segment. Columns with a `target` prefix are styled in a distinct shade to visually separate audience-targeted variants from the `all` default.
- **Row handles** — Left-most column that acts as a drag handle for reordering, also showing the 1-indexed row number.
- **Add column** — Header button that opens an inline modal to name and create a new experience column.

### Action Color Coding

Six visually distinct colors allow authors to scan a manifest at a glance and understand the distribution of action types without reading every cell:

| Action | Color |
|--------|-------|
| Insert Content After | Green |
| Replace Content | Yellow |
| Remove | Red |
| Insert Content Before | Blue |
| Replace Fragment | Pink |
| Append to Section | Purple |

### Notifications & Feedback

The tool uses two complementary feedback mechanisms:

- **Status Bar (persistent):** Always visible at the bottom. Shows `Saved` in green after a successful write, and `Unsaved changes` in orange whenever the model is dirty. Provides a constant ambient indication of save state.
- **Toast Notifications (transient):** Appear top-right on save/preview/publish completion. Success toasts include a URL, an "Open" button, and a "Copy URL" button. Error toasts include the failure reason. Both auto-dismiss after a short delay.

### Design Language

The UI follows Adobe Spectrum conventions — Adobe Blue as the primary action color, Typekit-loaded Adobe Clean as the typeface, and CSS custom properties for the full color palette. This matches the surrounding DA shell's visual language, making the tool feel native to the DA environment.

---

## Risks & Open Questions

| # | Risk / Question | Priority |
|---|----------------|----------|
| 1 | **No automated tests.** The model's serialization logic (open → edit → save round-trip) is complex enough to warrant unit tests. Currently there is no test coverage. | High |
| 2 | **No conflict detection on concurrent edits.** If two authors open the same manifest simultaneously, the last save wins. No optimistic locking or ETag-based conflict detection is in place. | Medium |
| 3 | **Token expiry not handled.** If the DA bearer token expires mid-session, API calls will fail. There is no re-authentication flow — the author would need to reload the tool. | Medium |
| 4 | **No grid virtualization.** All rows render to the DOM simultaneously. For manifests with a very large number of rows, this could cause performance degradation. Acceptable for typical manifest sizes today. | Low |
| 5 | **MEP JSON export converter exists but is unused by the UI.** It is unclear if this was intended for a future "Export" feature or is leftover from an earlier approach. Should be either wired up or removed. | Low |
