#!/usr/bin/env bash
# Builds the templates from source/, renders the mock model with velocityjs and runs every browser suite.
set -euo pipefail
cd "$(dirname "$0")"
TPL="../template/CATIA Magic Web 3.0"
python3 ../source/build.py "$TPL/web"
mkdir -p out/shots
node render.js "$TPL" out/small
node browser-test.js out/small out/shots
node richtest.js out/small out/shots
node failmodes.js out/small "$TPL"
echo "All suites passed."
