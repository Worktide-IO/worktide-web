#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Ensure dependencies are installed
if [ ! -f node_modules/.bin/vite ]; then
  echo "Installing dependencies…"
  CI=true pnpm install
fi

echo "Starting Vite dev server on http://0.0.0.0:5173"
echo "API calls will fail — the DDEV backend was removed."
echo "Frontend-only UI work (i18n, styling, tests) works without the API."
echo ""
echo "Press Ctrl+C to stop."
echo ""

exec node_modules/.bin/vite --host 0.0.0.0 --port 5173
