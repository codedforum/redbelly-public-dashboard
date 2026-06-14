#!/usr/bin/env bash
# One-command deploy for the Redbelly Public Dashboard.
#
#   ./deploy.sh vercel       deploy to Vercel production (needs: npm i -g vercel; vercel login)
#   ./deploy.sh selfhost     build and serve locally on :4173 (any static host works)
#   ./deploy.sh build        just produce the static ./dist bundle
#
# The app is a static client-side build (it talks to the Redbelly RPC directly from
# the browser), so ./dist can be served by ANY static host: nginx, Caddy, GitHub
# Pages, S3, Netlify, or Vercel.
set -euo pipefail
MODE="${1:-selfhost}"

echo "Installing dependencies..."
npm install --no-audit --no-fund

case "$MODE" in
  vercel)
    echo "Building and deploying to Vercel..."
    npm run build
    npx vercel deploy --prod --yes
    ;;
  build)
    npm run build
    echo "Static bundle ready in ./dist (serve it with any static host)."
    ;;
  selfhost|*)
    npm run build
    echo "Serving ./dist on http://localhost:4173 (Ctrl+C to stop)."
    npm run preview
    ;;
esac
