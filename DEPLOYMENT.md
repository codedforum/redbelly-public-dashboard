# Deployment

The dashboard is a static client-side build. `npm run build` produces `./dist`, which any static host can serve. The included `./deploy.sh` wraps the common paths.

## One command
```bash
./deploy.sh vercel      # build and deploy to Vercel production
./deploy.sh selfhost    # build and serve on http://localhost:4173
./deploy.sh build       # build only -> ./dist
```

## Vercel
Prerequisites: `npm i -g vercel` and `vercel login` once.
```bash
./deploy.sh vercel
# or directly:
npm run build && npx vercel deploy --prod --yes
```
`vercel.json` sets the Vite framework, `npm run build`, the `dist` output, and an SPA rewrite. Vercel also auto-detects Vite if you import the repo through the dashboard; no extra config needed.

## Self-hosted (any static host)
```bash
npm run build      # produces ./dist
```
Then serve `./dist` with whatever you run:

- **nginx**
  ```nginx
  server {
    listen 80;
    server_name dashboard.example.com;
    root /var/www/redbelly-dashboard;     # contents of ./dist
    location / { try_files $uri $uri/ /index.html; }
  }
  ```
- **Caddy:** `caddy file-server --root ./dist --listen :8080`
- **Python (quick):** `python3 -m http.server 4173 --directory dist`
- **Node:** `npm run preview` (Vite preview server)
- **GitHub Pages / S3 / Netlify:** upload the contents of `./dist`.

Because the app calls the Redbelly RPC directly from the browser, no server, API key, or environment variable is required at runtime. To point at a different RPC, set `VITE_REDBELLY_RPC` before `npm run build`.

## Verified
- `./deploy.sh build` and `npm run build` produce a working `./dist` (tested locally; served via `python3 -m http.server` and Vite preview, live data confirmed).
- Vercel: `vercel.json` is provided and the project is a standard Vite app, which Vercel deploys with zero extra configuration.

## Updating a live self-hosted copy
Re-run `npm run build` and copy `./dist` to the web root. No process restart is needed for a static host.
