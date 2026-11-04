# Magicdraw-Web-Publisher-Replacement
This replaces the old Web Publisher 2.0 from CATIA Magic (AKA MagicDraw or Cameo). That report was written for server-based use only and is quite old and unmaintained. This version uses modern web features and complies with draconian security profiles. So far, I have done quick smoke tests in the following browsers:  Chrome, Firefox, and Edge. **IF YOU HAVE ISSUES OR FEATURE REQUESTS, CREATE AN ISSUE.** I am happy to add you as a collaborator if you do good work.

## Note: This is not supported by Dassault Systèmes!
Use at your own risk! **No Warranty!** No support from me (unless you are nice)!

## Quick Start

**Step 1 - ** Clone this repository.
```
git clone https://github.com/turbogeek/Magicdraw-Web-Publisher-Replacement.git
```
(Or use GitHub Desktop, VS Code "Git: Clone", or Code ▸ Download ZIP.)

**Step 2 - ** In Cameo/CATIA Magic Report Wizard, create a new template and set the template file to `catia-magic-web/template/CATIA Magic Web 3.0/web/index.html` (keep the rest of that `web` folder next to it). Here is an example
<img width="1181" height="586" alt="image" src="https://github.com/user-attachments/assets/264c8dca-c369-4176-85a1-e2b8e13eb990" />

**Step 3 - ** Run the template as normal. Use SVG for highest fidelity and usually smallest footprint or PNG for lossless compressed images (avoid JPG).

**Note:** The report is a small web page (`MyModel.html`) plus a `MyModel_files` folder with the viewer, the diagram images, and the model data. Keep them together when you copy or zip the report. Large models are fine: the page opens with a progress bar, shows the model tree first, and loads documentation and diagram details in the background. If something looks incomplete, open **About this publication** (bottom of the sidebar) to see which data files loaded.

## How to use it and how it is designed
Documentation: https://github.com/turbogeek/Magicdraw-Web-Publisher-Replacement/blob/main/catia-magic-web/README.md 

## LICENSE
MIT
