# CATIA Magic Web 3.0 (3.0.4) – Report Wizard template

Publishes the model as a website that opens straight from disk (`file://`) or from any web server, and stays fast on large models.

## Install

Copy this folder to `<install dir>/data/templates/`, or use **Tools ▸ Report Wizard ▸ Import**. Then generate with **Tools ▸ Report Wizard ▸ CATIA Magic Web 3.0** and open the generated `.html`. Keep it next to its `_files` folder.

## Template variables

| Variable | Default | Description |
|---|---|---|
| Title, Author | | Header, home page, PDF cover |
| HomeImage | empty | Empty = overview page. Can also be a diagram name, `mdel://ID`, `file://path` or `http(s)://URL`. |
| DataFiles | true | Progressive `data/*.js` files (recommended); false = everything inside the page (small models only) |
| IncludeAllProperties | true | Full Specification properties (loaded on demand); false shrinks large outputs by about 60 % |
| DiagramHotspots | true | Clickable shapes on diagrams |
| UseContextMenu | true | Right-click menu on diagram shapes |
| DiagramPreviews | false | Home-page thumbnails on by default |
| ShowAppearsInPage | true | "Appears in" list |
| ExportLinkedFile | true | Copy and link attached files |
| SVGDiagramResizable | true | Fit diagrams to the window when they open |
| DisplayTreeElementId / ShowAppliedStereotypes | false | Extra detail in the tree |
| SkipElementContext | **false** | Must stay false |

## Files

- `web/index.html`: main template (shell page, data-file loops, diagram image references).
- `web/cmw-elements.txt`, `web/cmw-docs.txt`, `web/cmw-diagrams.txt`, `web/cmw-props.txt`: sub-templates run by `$file.create()`. They are generated from the repository's `source/` folder; edit `source/macros.vm` there and run `build.py`.
- `web/js/cmw.js`, `web/css/cmw.css`: viewer and styles.
- `web/js/vendor/purify.min.js`: DOMPurify 3.4.17 (license alongside).

## Troubleshooting

Open **About this publication** (the link at the bottom of the sidebar, or `#/about`) to see every data file and whether it loaded.
If the data files were not generated, set `DataFiles` = false and check the Report Wizard log.
See the repository README for the full user guide, architecture and changelog.
