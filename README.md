# Magicdraw-Web-Publisher-Replacement
This replaces the old Web Publisher 2.0 from CATIA Magic (AKA MagicDraw or Cameo). That report was written for server-based use only and is quite old and unmaintained. This version uses modern web features and complies with draconian security profiles. So far, I have done quick smoke tests in the following browsers:  Chrome, Firefox, and Edge. **IF YOU HAVE ISSUES OR FEATURE REQUESTS, CREATE AN ISSUE.** I am happy to add you as a collaborator if you do good work.

## Note: This is not supported by Dassault Systèmes!
Use at your own risk! **No Warranty!** No support from me (unless you are nice)!

## Quick start.

**1** Download the file from here: https://github.com/turbogeek/Magicdraw-Web-Publisher-Replacement/blob/main/distro/Web%20Publisher3_0_4.mrzip

<img width="1481" height="455" alt="image" src="https://github.com/user-attachments/assets/99918e54-10c0-4516-83a1-ff5d0693a863" />

**2**  From the Report Wizard, 1) Press Import, 2) select the downloaded mrzip 3) press Open.

<img width="1024" height="647" alt="image" src="https://github.com/user-attachments/assets/82ca73ee-fb21-41f9-9042-f8704c0aa529" />

**3** The report will show up in the Default Template section as **Web Publisher 3.0** and will be used like the 2.0 version
  
<img width="748" height="578" alt="image" src="https://github.com/user-attachments/assets/626a8bde-da54-40ea-ac85-bf2aa3370e40" />


## Slower Start if actively developing changes to the template in the context of the git or your own cloned git.

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
