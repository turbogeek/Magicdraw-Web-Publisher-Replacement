# Changelog

## 3.0.3

- **«CustomImageHolder» images render as images.** Their `content` (base64 PNG/GIF/JPEG/BMP/WebP, or SVG text), `format` (`PNG`, `SVG`, `MIME: image/...`) and `location` are decoded into an image, with the format and source as a caption. The raw encoding is no longer shown, and the internal stereotype chip is hidden. Long base64 image data in any other value is also shown as an image.
- **HTML is rendered everywhere it appears.** Comments and notes, tagged values (e.g. requirement *Text*) and Specification property values are sanitized and shown as formatted text, on pages and in PDF reports.
- **Comment and note text is exported.** The template now writes `Comment.body`. Comments are labeled by their plain text instead of `Comment: <html>…`. Search with *Include documentation* also searches comment text.
- Names that contain HTML are shown as plain text; script and style content is dropped.
- Fix: the search suggestion list closed only on blur, so it could stay open after navigating.
- New: GitHub README, portable test suite (`tests/run-all.sh`), documentation screenshots.

## 3.0.2

- **Large models.** The page is now a small shell with an instant loading screen. Model data goes into progressive `data/*.js` files (elements, diagrams, and on-demand properties). On a 60k-element model: 185 MB → 28 KB page, 9.5 s freeze → 0.1 s, usable in 3.7 s instead of 13.9 s.
- Loading states everywhere (diagrams, properties, previews, PDF building), a "Nothing happening?" hint after 10 s, a warning banner for missing data files, an error screen for a missing data folder, and an **About this publication** page (`#/about`).
- Lighter home page: diagrams listed by type, with an opt-in **Show previews** switch that loads thumbnails one at a time.
- Tree renders large folders in pages of 300.
- Diagram alignment uses one content bounding box per diagram.
- New variables: `DataFiles`, `DiagramPreviews`.

## 3.0.1

- **Diagram images export.** 3.0.0 passed `$d.image` through a macro, so Report Wizard wrote `Image [id=…]` instead of the file.
- Hotspots line up with Cameo's anchored image layout (origin + 25 px margin).
- **PDF export:** this page, a branch, or the whole model, with cover, contents, numbered sections and figures, and page numbers.
- New layout: tabs and details panel, diagram gallery, Relations folders, cleaned project name.
- Themes: System, Light, Dark, Kawaii.
- Fixes: double-escaped representation text, empty properties, internal stereotypes.

## 3.0.0

- Initial redesign of Web Publisher 2.0. Works from `file://` (no XHR), uses no frameworks or `eval`, has a CSP and DOMPurify, and is rebranded as CATIA Magic Web 3.0.
