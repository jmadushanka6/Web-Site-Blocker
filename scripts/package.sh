#!/bin/sh
# Builds the zip to upload to the Chrome Web Store: only the files the
# extension needs at runtime (no tests, docs or tooling).
set -eu
cd "$(dirname "$0")/.."

version=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' manifest.json | head -n 1)
out="dist/locked-site-blocker-$version.zip"

mkdir -p dist
rm -f "$out"
zip -q -X "$out" manifest.json *.html *.js icons/*.png
echo "Built $out:"
unzip -l "$out"
