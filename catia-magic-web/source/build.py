"""Assembles the Report Wizard templates: inserts vm-src/macros.vm where @@MACROS@@ appears.
Usage: python3 build.py <template web dir>"""
import sys, pathlib
src = pathlib.Path(__file__).parent
web = pathlib.Path(sys.argv[1])
macros = (src / 'macros.vm').read_text()
for name in ['index.html', 'cmw-elements.txt', 'cmw-props.txt', 'cmw-diagrams.txt']:
    text = (src / name).read_text().replace('@@MACROS@@', macros.rstrip('\n'))
    (web / name).write_text(text)
    print('built', name, len(text))
